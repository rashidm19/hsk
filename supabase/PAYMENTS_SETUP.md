# Payments — Supabase setup (HSK side)

Apply once, in order. The `pay.studybox.kz` backend (separate repo) is the caller.

## 1. Schema
Run the full `supabase/schema.sql` in the Supabase SQL editor (idempotent). It adds the
`payments` table (RLS enabled, **zero policies**), the `profiles_guard_subscription`
trigger that makes `profiles.subscription` writable only by the service-role (or by the
entitlement function below), and `apply_hsk_entitlement(uid)` — the single writer of
`profiles.subscription`, which recomputes it from every `status='paid'` payment so duplicate
real orders **stack** the term and get flagged for refund review (see § Duplicate charges).

## 2. Edge Function
**Update order matters on an already-live install:** run the updated `schema.sql` **before**
redeploying the function. Since 2026-07-02 the function grants via `apply_hsk_entitlement()`;
deployed against a database that lacks it, every grant would return `entitlement:false`.
(The reverse is safe: new schema + old function keeps the old overwrite behavior.)

Deploy `grant-entitlement` with JWT verification **off** (the StudyBox call carries only an
HMAC, no Supabase JWT):

```bash
supabase functions deploy grant-entitlement --no-verify-jwt
```

Set the shared secret (pick a long random value; never commit it; it is NOT in config/auth.js):

```bash
supabase secrets set HSK_GRANT_HMAC_SECRET='<long-random-secret>'
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — do not set them.

## 3. Hand off to StudyBox (out-of-band)
- Function URL: `https://<project-ref>.functions.supabase.co/grant-entitlement`
- The same `HSK_GRANT_HMAC_SECRET`.
- Must be the SAME Supabase project that backs `config/auth.js` (auth/profiles).

## 4. Interface the StudyBox webhook must satisfy
POST JSON body, header `X-HSK-Signature: <hex HMAC-SHA256 of the raw body>`:

```json
{ "uid": "<hsk supabase user id>", "plan": "1mo|3mo|12mo", "order_id": "<acquiring order>",
  "currency": "KZT", "paid_at": "<ISO8601>", "ts": <unix seconds>, "receipt": "<optional>" }
```

Sign the **raw body bytes** exactly as sent (no re-serialization — JSON key reordering breaks the
HMAC). The function re-derives amount / interval / expires_at from the plan map (below); any
`amount`/`months`/`expires_at` in the body are audit-only and are NOT part of the signed contract.
Replay is covered by `order_id` idempotency + `ts` freshness (±300 s) — no nonce.

Success responses carry additive informational keys — `expires_at` (final coverage end after the
ledger fold) and `review: "double_charge"` when this order stacked onto already-running coverage.
Callers must parse by key, never strict-match the whole body.

## 5. Plan → KZT (must match data/onboarding.json)
| plan | amount (₸) | months |
|------|-----------:|:------:|
| 1mo  | 39 000     | 1      |
| 3mo  | 54 000     | 3      |
| 12mo | 149 000    | 12     |

## Duplicate charges & refunds (policy)

`order_id` idempotency dedupes only retries of one order. A user whose webhook is lagging can
complete a **second real checkout** (new `order_id`) — the client's 30-min `LS_PAY_PENDING`
stopgap is single-device and clearable, so the server policy is authoritative:

- **Stacking:** `apply_hsk_entitlement(uid)` folds all `status='paid'` orders by `paid_at`; each
  extends coverage from `max(prior expiry, its paid_at)`. A duplicate charge therefore buys extra
  time — money is never silently lost.
- **Review queue:** an order paid while coverage was already running is flagged. List it with:
  `select order_id, user_id, plan, amount, paid_at, review_note from payments where review_status = 'double_charge';`
  Record your verdict by overwriting `review_status` (e.g. `'refunded'`, `'reviewed_ok'`) — the
  recompute never clobbers a non-null value.
- **Refund runbook:** refund at the acquiring (StudyBox side), then
  `update payments set status = 'refunded', review_status = 'refunded' where order_id = '<id>';`
  followed by `select public.apply_hsk_entitlement('<uid>');` — coverage shrinks to the remaining
  paid ledger, or revokes (`subscription = null`) when nothing paid remains.
- Direct `update profiles set subscription = …` in the SQL editor is **blocked by design** (guard
  trigger) — always go through the function so subscription never drifts from the ledger.
- **Manual grant / comp:** never hand-write `subscription` (a later recompute would replace it).
  Enter it as ledger truth instead:
  `insert into payments (order_id, user_id, plan, amount, currency, status, months, paid_at)
  values ('comp-<ref>', '<uid>', '3mo', 0, 'KZT', 'paid', 3, now());`
  then `select public.apply_hsk_entitlement('<uid>');`.

Verified 2026-07-02 against the live project in a rolled-back transaction: stacking, flagging,
replay convergence, out-of-order arrival, refund shrink, full-refund revoke, month-end clamp
(Jan 31 + 1 mo = Feb 28/29), and the guard trigger.

## Launch checklist
- [ ] schema.sql applied; `payments` exists with RLS on and no policies.
- [ ] function deployed `--no-verify-jwt`; `HSK_GRANT_HMAC_SECRET` set.
- [ ] StudyBox has the URL + secret and the plan→KZT table matches this file and onboarding.json.
- [ ] The lock trigger does NOT block a normal authenticated `updateProfile({onboarding})` write.
- [ ] End-to-end test order flips `profiles.subscription.status` to `active`.
- [ ] Double-charge e2e: two test orders for one uid → `expires_at` stacks (2× term) and the second
      `payments` row carries `review_status = 'double_charge'`.

## Runbook — lost/failed webhook
1. Read the acquiring order on the StudyBox side; get `order_id`, `uid`, `plan`, `paid_at`.
2. Re-POST `grant-entitlement` with a fresh `ts`. The function **re-applies the entitlement on replay**
   (so this reconciles a lost webhook OR a prior `entitlement:false`) and is idempotent for the
   `payments` ledger. A persisting `entitlement:false` means the `uid`/profile is bad — investigate it.
3. Verify (service-role SQL): `select subscription from profiles where id = '<uid>';`
4. Audit: `select * from payments where order_id = '<order_id>';`
