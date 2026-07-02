-- HSK Prep — run in Supabase SQL Editor (Dashboard → SQL)

-- Profile row per authenticated user (name, country from sign-up form)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Onboarding funnel: quiz answers + (simulated) subscription status, written by
-- HSKAuth.updateProfile() once the user has a session. The existing
-- "profiles_update_own" policy already authorizes the owner to write these.
alter table public.profiles
  add column if not exists onboarding   jsonb,
  add column if not exists subscription jsonb;

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Optional: keep profiles in sync when auth.users metadata changes
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, country)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'country', '')
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ── Payments (written ONLY by the grant-entitlement Edge Function via service-role) ──
create table if not exists public.payments (
  order_id      text primary key,
  user_id       uuid references auth.users (id) on delete set null,
  plan          text,
  amount        numeric,
  currency      text,
  status        text not null default 'paid',   -- 'paid' | 'refunded' (operator-set; only 'paid' rows grant)
  months        integer,                        -- term length, derived server-side from the plan map
  receipt       text,
  paid_at       timestamptz,
  raw           jsonb,
  -- Double-charge review queue: apply_hsk_entitlement() sets 'double_charge' on an order paid
  -- while coverage was already running; operators overwrite with their verdict ('refunded',
  -- 'reviewed_ok', …) and the recompute never clobbers a non-null value.
  review_status text,
  review_note   text,
  created_at    timestamptz not null default now()
);

-- Same columns for a payments table created by an earlier schema.sql run (idempotent).
alter table public.payments
  add column if not exists months        integer,
  add column if not exists review_status text,
  add column if not exists review_note   text;

create index if not exists payments_user_id_paid_at_idx on public.payments (user_id, paid_at);

-- RLS ENABLED with ZERO policies: anon/authenticated read nothing; service-role bypasses RLS.
-- (No policies by design — do NOT add a select policy or the financial/PII ledger leaks.)
alter table public.payments enable row level security;

-- ── Lock profiles.subscription: only the service-role (Edge Function) may change it ──
create or replace function public.guard_subscription_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- The service-role (grant-entitlement Edge Function) may always write subscription, as may
  -- apply_hsk_entitlement() below — it marks itself with a transaction-local writer flag so the
  -- SQL-editor runbook (refund recompute) works without a service-role JWT. Direct UPDATEs from
  -- the SQL editor stay blocked: subscription must never drift from the payments ledger.
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('hsk.entitlement_writer', true), '') = '1' then
    return new;
  end if;
  -- Non-service-role: subscription must be absent on INSERT and unchanged on UPDATE,
  -- so a client cannot self-grant by inserting its own profiles row before one exists.
  if tg_op = 'INSERT' then
    if new.subscription is not null then
      raise exception 'profiles.subscription is read-only for non-service-role';
    end if;
  elsif new.subscription is distinct from old.subscription then
    raise exception 'profiles.subscription is read-only for non-service-role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_subscription on public.profiles;
create trigger profiles_guard_subscription
  before insert or update on public.profiles
  for each row execute function public.guard_subscription_write();

-- ── Entitlement = a pure function of the payments ledger (double-charge policy) ──
--
-- Why: order_id idempotency only dedupes RETRIES of one order. A user whose webhook is lagging
-- can complete a second real checkout (new order_id) — both payments are real money, so neither
-- may be dropped. Policy: terms STACK (each paid order extends coverage from
-- max(prior expiry, its own paid_at)) and an order paid while coverage was already running is
-- flagged review_status='double_charge' for proactive refund at the acquiring.
--
-- apply_hsk_entitlement(uid) recomputes profiles.subscription from every status='paid' payment,
-- so webhook replays, out-of-order arrival, operator re-drives, and refunds all converge on the
-- same state. Refund runbook: set payments.status='refunded' on the row, then re-run this —
-- coverage shrinks (or revokes entirely) to match the remaining paid ledger.

-- JS-toISOString-shaped UTC render ("2026-07-15T10:00:00.000Z") — the exact shape every
-- existing reader (subActive() Date.parse in auth-guard.js / onboarding.js) was built against.
create or replace function public.hsk_iso(ts timestamptz)
returns text
language sql
immutable
as $$ select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

create or replace function public.apply_hsk_entitlement(p_uid uuid)
returns jsonb
language plpgsql
security definer set search_path = public set timezone = 'UTC'
as $$
declare
  r record;
  v_last record;
  v_expires timestamptz := null;
  v_orders integer := 0;
  v_flagged jsonb := '[]'::jsonb;
begin
  -- Sanctioned-writer flag for profiles_guard_subscription (transaction-local).
  perform set_config('hsk.entitlement_writer', '1', true);

  -- Ensure the row exists, then lock it: concurrent grants for one user serialize here, and
  -- each recompute below (fresh snapshot per statement under READ COMMITTED) sees every
  -- payment committed by the transaction it waited on — no lost extension.
  insert into profiles (id) values (p_uid) on conflict (id) do nothing;
  perform 1 from profiles where id = p_uid for update;

  for r in
    select order_id, plan, amount, months, paid_at
      from payments
     where user_id = p_uid and status = 'paid'
       and paid_at is not null and coalesce(months, 0) > 0
     order by paid_at, order_id
  loop
    if v_expires is not null and r.paid_at < v_expires then
      v_flagged := v_flagged || to_jsonb(r.order_id);
      update payments
         set review_status = 'double_charge',
             review_note   = 'paid at ' || hsk_iso(r.paid_at) || ' while coverage already ran to '
                             || hsk_iso(v_expires) || ' — candidate for refund'
       where order_id = r.order_id
         and review_status is null;  -- never clobber an operator's verdict
    end if;
    -- interval month-addition clamps month-end exactly like the Edge Function's retired
    -- computeExpiry(): Jan 31 + 1 month = Feb 28/29, in UTC (timezone pinned above).
    v_expires := greatest(coalesce(v_expires, r.paid_at), r.paid_at) + make_interval(months => r.months);
    v_orders  := v_orders + 1;
    v_last    := r;
  end loop;

  if v_orders = 0 then
    -- No paid orders left (e.g. everything refunded): revoke back to the pre-purchase state.
    update profiles set subscription = null, updated_at = now() where id = p_uid;
    return jsonb_build_object('orders', 0, 'expires_at', null, 'flagged', v_flagged);
  end if;

  -- Canonical subscription shape (metadata from the latest-paid order; expiry from the fold).
  update profiles
     set subscription = jsonb_build_object(
           'status',     'active',
           'plan',       v_last.plan,
           'price',      v_last.amount,
           'currency',   'KZT',
           'interval',   v_last.months || ' month' || case when v_last.months = 1 then '' else 's' end,
           'provider',   'studybox',
           'order_id',   v_last.order_id,
           'paid_at',    hsk_iso(v_last.paid_at),
           'expires_at', hsk_iso(v_expires)
         ),
         updated_at = now()
   where id = p_uid;

  return jsonb_build_object('orders', v_orders, 'expires_at', hsk_iso(v_expires), 'flagged', v_flagged);
end;
$$;

-- Service-role (the Edge Function) and the SQL editor (postgres, function owner) only.
revoke execute on function public.apply_hsk_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.apply_hsk_entitlement(uuid) to service_role;
