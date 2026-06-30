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
  order_id   text primary key,
  user_id    uuid references auth.users (id) on delete set null,
  plan       text,
  amount     numeric,
  currency   text,
  status     text not null default 'paid',
  receipt    text,
  paid_at    timestamptz,
  raw        jsonb,
  created_at timestamptz not null default now()
);

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
  -- The service-role (grant-entitlement Edge Function) may always write subscription.
  if coalesce(auth.role(), '') = 'service_role' then
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
