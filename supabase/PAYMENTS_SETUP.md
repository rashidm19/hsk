# Payments — Supabase setup (HSK side)

Apply once, in order. The `pay.studybox.kz` backend (separate repo) is the caller.

## 1. Schema
Run the full `supabase/schema.sql` in the Supabase SQL editor (idempotent). It adds the
`payments` table (RLS enabled, **zero policies**) and the `profiles_guard_subscription`
trigger that makes `profiles.subscription` writable only by the service-role.

## 2. Edge Function
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

## 5. Plan → KZT (must match data/onboarding.json)
| plan | amount (₸) | months |
|------|-----------:|:------:|
| 1mo  | 39 000     | 1      |
| 3mo  | 54 000     | 3      |
| 12mo | 149 000    | 12     |

## Launch checklist
- [ ] schema.sql applied; `payments` exists with RLS on and no policies.
- [ ] function deployed `--no-verify-jwt`; `HSK_GRANT_HMAC_SECRET` set.
- [ ] StudyBox has the URL + secret and the plan→KZT table matches this file and onboarding.json.
- [ ] The lock trigger does NOT block a normal authenticated `updateProfile({onboarding})` write.
- [ ] End-to-end test order flips `profiles.subscription.status` to `active`.

## Runbook — lost/failed webhook
1. Read the acquiring order on the StudyBox side; get `order_id`, `uid`, `plan`, `paid_at`.
2. Re-POST `grant-entitlement` with a fresh `ts`. The function **re-applies the entitlement on replay**
   (so this reconciles a lost webhook OR a prior `entitlement:false`) and is idempotent for the
   `payments` ledger. A persisting `entitlement:false` means the `uid`/profile is bad — investigate it.
3. Verify (service-role SQL): `select subscription from profiles where id = '<uid>';`
4. Audit: `select * from payments where order_id = '<order_id>';`
