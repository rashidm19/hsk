# StudyBox ⇄ HSK Prep — Payment Integration Spec

**Audience:** the StudyBox `pay.studybox.kz` engineering team (frontend + backend).
**Status:** HSK Prep side is implemented and merged on `claude/dev`; this spec is the contract you build against.
**Date:** 2026-06-30

> This document does **not** assume anything about how StudyBox is currently built — your repo
> agents know that. It explains (a) how payments already work on the **HSK Prep** side, and
> (b) exactly what **StudyBox** must implement and the wire contract between the two.

---

## 1. Why this integration exists

HSK Prep (`hskprep.cc`) is a static site and cannot host the acquiring (the payment provider is
bound to the `studybox.kz` domain). So HSK Prep **reuses the existing StudyBox acquiring**: when a
user pays, HSK redirects them to `pay.studybox.kz`, StudyBox runs the one-time charge, and StudyBox
tells HSK the payment succeeded via a server-to-server call. The browser redirect back to HSK is
**UX only** — entitlement is granted exclusively by the verified server call.

**Billing model:** one-time, fixed-term purchase (1 / 3 / 12 months). **No subscription, no
auto-renew, no card-on-file, no rebill.** A single charge grants access for the term.

---

## 2. Roles — who does what

**HSK Prep side (already built — do not re-implement):**
- Redirects the paying user to `https://pay.studybox.kz/checkout?...` with the user's identity + chosen plan.
- Exposes a Supabase Edge Function **`grant-entitlement`** that StudyBox calls after a verified payment.
  It writes the entitlement into HSK's database (`profiles.subscription`) and is idempotent.
- After the redirect back, HSK polls its own DB for the entitlement and shows the success screen.

**StudyBox side (what you build):**
1. **Frontend** — a `/checkout` page on `pay.studybox.kz` that reads the query params, shows the plan
   + KZT amount, and collects card details via the acquiring.
2. **Backend** — create a **one-time** acquiring order (amount from the plan → KZT map), handle the
   acquiring's webhook, and on success **call HSK's `grant-entitlement`** with an HMAC-signed body.
3. **Return** — redirect the user back to HSK's `return` (success) or `cancel` URL.

You do **not** write to HSK's database directly and you never receive HSK's Supabase service-role key.
Your only outbound integration point is the `grant-entitlement` HTTP call.

---

## 3. End-to-end flow

```
User on hskprep.cc/quiz/ clicks Pay
        │
        ▼  (browser redirect, GET)
GET pay.studybox.kz/checkout?product=hsk&plan=&uid=&email=&return=&cancel=
        │
        ▼  StudyBox frontend renders plan + KZT amount + acquiring card form
User pays
        │
        ├──────────────► acquiring confirms
        │                        │
        │   (server webhook)     ▼
        │                StudyBox backend verifies the acquiring signature,
        │                is idempotent by order_id, then:
        │                        │
        │                        ▼  (POST + HMAC)  ← SOURCE OF TRUTH
        │                POST https://<hsk>.functions.supabase.co/grant-entitlement
        │                        │  → HSK writes profiles.subscription = active
        │
        ▼  (browser redirect back)
302 → https://www.hskprep.cc/quiz/?pay=success   (or ?pay=cancel on failure/abandon)
        │
        ▼  HSK polls its DB for status:'active' and shows success
```

The redirect back (last step) grants nothing on its own — only the `grant-entitlement` call does.
The two can arrive in any order; HSK tolerates the race by polling. **You must fire the webhook call
reliably** even if the user closes the tab before returning.

---

## 4. Interface 1 — inbound redirect (HSK → StudyBox)

HSK sends the user here via a plain browser GET. Base URL is configured on the HSK side as
`https://pay.studybox.kz/checkout`.

```
GET https://pay.studybox.kz/checkout
      ?product=hsk
      &plan=<1mo|3mo|12mo>
      &uid=<hsk_user_id>            # opaque HSK Supabase user UUID — treat as the identity key
      &email=<url-encoded email>    # may be empty; use for prefill/receipt only, NOT identity
      &return=<url-encoded>         # e.g. https://www.hskprep.cc/quiz/?pay=success
      &cancel=<url-encoded>         # e.g. https://www.hskprep.cc/quiz/?pay=cancel
```

| Param | Meaning | Notes |
|-------|---------|-------|
| `product` | Always `hsk` | Lets you route if `/checkout` serves multiple products |
| `plan` | `1mo` \| `3mo` \| `12mo` | Maps to a fixed KZT amount (§6). Reject anything else. |
| `uid` | HSK user id | **This is the grant key** — echo it, unchanged, to `grant-entitlement`. Non-enumerable UUID. |
| `email` | User email (optional) | Prefill / receipt only. Do **not** use as identity; may differ from card. |
| `return` | Success return URL | Redirect here after a successful charge. Absolute HSK URL. |
| `cancel` | Cancel/failure return URL | Redirect here on decline/abandon. You may append `&reason=declined\|abandoned`. |

**Trust:** this redirect is unauthenticated (a static site can't sign it). That is fine because:
- the **amount is never taken from the client** — you compute it from `plan` (§6);
- entitlement is granted only by the acquiring-verified webhook, never by the redirect;
- tampering `uid`/`plan` only lets an attacker pay *for someone else's* account — not an attack.

Recommended hardening: serve `/checkout` with `Referrer-Policy: no-referrer` (the email travels in the URL).

---

## 5. What StudyBox implements

### 5.1 Frontend — `pay.studybox.kz/checkout`
- Parse the query params above. Validate `product=hsk` and `plan ∈ {1mo,3mo,12mo}`; show a clean error otherwise.
- Display the plan and the **KZT amount** (§6). Prefill email if present.
- Render the acquiring's card form (on `studybox.kz`, satisfying the provider's domain rule).
- Mobile-first: the HSK funnel audience is predominantly mobile (incl. in-app webviews).
- On payment result, redirect the browser to `return` (success) or `cancel` (failure/abandon).

### 5.2 Backend — order creation
- Map `plan → amount (KZT), months` from §6. **Amount is authoritative here — never trust a
  client-supplied price** (HSK sends only the plan id).
- Create a **one-time** acquiring order (not a recurring/mandate order).
- Attach metadata to the order so the webhook can recover it: at minimum `{ product: "hsk", hsk_uid,
  plan }`. You need `hsk_uid` and `plan` back at webhook time to call `grant-entitlement`.

### 5.3 Backend — acquiring webhook handler
- Verify the acquiring's own webhook signature (provider-specific — your repo knows this).
- Be **idempotent by the acquiring `order_id`** (webhooks retry). Only grant once per order.
- On a confirmed successful payment, call HSK's `grant-entitlement` (§5.4).
- Persist the outcome so a lost/failed downstream call can be re-driven (see §8).

### 5.4 Backend — outbound call to HSK (Interface 2)

This is the only call into HSK. **Endpoint + secret are provided by HSK out-of-band** (see §9).

```
POST https://<hsk-project-ref>.functions.supabase.co/grant-entitlement
Content-Type: application/json
X-HSK-Signature: <lowercase hex HMAC-SHA256 of the RAW request body, keyed with HSK_GRANT_HMAC_SECRET>
```

HSK intends to deploy the function with `--no-verify-jwt` so the **HMAC is the sole authentication**
(no Supabase JWT / `apikey` needed). This is a deploy-time gateway setting, **not yet verified** —
confirm at integration time that an unauthenticated POST (no `Authorization`/`apikey` header) actually
reaches the function. Tell-tale: a `401` whose body is **not** the string `bad signature` means
Supabase JWT verification is still on (a gateway rejection, not a signing bug) — flag it to HSK rather
than chasing your signature. HSK will provide the exact URL.

**Request body (JSON):**

```json
{
  "uid":      "<hsk_uid from the redirect>",
  "plan":     "1mo | 3mo | 12mo",
  "order_id": "<your acquiring order id — globally unique, used as the idempotency key>",
  "currency": "KZT",
  "paid_at":  "2026-06-30T12:34:56.000Z",
  "ts":       1782831296,
  "receipt":  "<optional acquiring receipt/reference for support>"
}
```

Field rules (enforced by the function — a mismatch is rejected):

| Field | Required | Rule |
|-------|----------|------|
| `uid` | yes | The HSK user id from the redirect, unchanged. |
| `plan` | yes | Must be `1mo`/`3mo`/`12mo` (else 400 `unknown plan`). |
| `order_id` | yes | Unique per order. Idempotency key — re-sending the same one is a safe no-op. |
| `currency` | yes | Must be exactly `"KZT"` (else 400 `bad currency`). |
| `paid_at` | yes | Valid ISO-8601 datetime (else 400 `bad paid_at`). |
| `ts` | yes | **Unix time in seconds**, within **±300 s** of HSK's clock (else 400 `stale`). |
| `receipt` | no | Stored for support. |

**Ignored / do not rely on:** any `amount`, `months`, or `expires_at` you put in the body are
audit-only — the function **re-derives** amount, interval, and expiry from `plan`. Keep them out of
what matters; only the fields above drive the grant.

**Signature (critical — must match byte-for-byte):**
- Sign the **exact raw bytes of the request body you send** — build the JSON string once, sign *that
  string*, and send *that string*. Re-serializing (different key order/spacing) breaks the HMAC.
- `HMAC-SHA256(HSK_GRANT_HMAC_SECRET, rawBody)`, hex-encoded, lowercase, in header `X-HSK-Signature`.

Node example:
```js
const crypto = require("crypto");
const bodyStr = JSON.stringify({ uid, plan, order_id, currency: "KZT", paid_at, ts });
const sig = crypto.createHmac("sha256", HSK_GRANT_HMAC_SECRET).update(bodyStr).digest("hex");
await fetch(HSK_GRANT_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-HSK-Signature": sig },
  body: bodyStr,                       // send the SAME string that was signed
});
```

Python example:
```python
import hmac, hashlib, json, time
body_str = json.dumps({"uid": uid, "plan": plan, "order_id": order_id,
                       "currency": "KZT", "paid_at": paid_at, "ts": int(time.time())},
                      separators=(",", ":"))
sig = hmac.new(HSK_GRANT_HMAC_SECRET.encode(), body_str.encode(), hashlib.sha256).hexdigest()
# POST body_str verbatim with header X-HSK-Signature: sig
```

> `receipt` is optional; if you include it, it must be **inside the signed body** — always sign
> exactly the bytes you POST. (Both examples above sign the minimal required field set.)

**Responses & retry policy:**

| Status | Body | Meaning | Your action |
|--------|------|---------|-------------|
| 200 | `{"ok":true}` | Entitlement granted | Done. |
| 200 | `{"ok":true,"idempotent":true}` | `order_id` already processed | Treat as success. |
| 200 | `{"ok":true,"entitlement":false}` | Payment recorded, profile write failed | Treat as success but **alert** — HSK will reconcile (re-drive later works). |
| 401 | `bad signature` | HMAC mismatch | **Do not retry blindly** — fix signing/secret. |
| 400 | `unknown plan` / `bad currency` / `stale` / `missing fields` / `bad paid_at` / `bad json` | Permanent caller error | **Do not retry as-is.** `stale` → re-send with a fresh `ts`. |
| 405 | `method not allowed` | Not a POST | Fix the request. |
| 500 | `misconfigured` / `db error` | HSK-side transient/config | **Retry with backoff** (fresh `ts`); idempotent by `order_id`. |

Rule of thumb: **retry only on 5xx** (with a fresh `ts`), never on 4xx (except `stale` → refresh `ts`).
`order_id` idempotency makes retries safe.

On a body with several problems at once, the **first failing check wins**, in this fixed order:
signature → JSON parse → `plan` → `currency` → `ts` freshness → required fields (`uid`/`order_id`/`paid_at`)
→ `paid_at` validity. Don't assert a specific error for a multiply-invalid body in your tests.

### 5.5 Return redirect
- On success → `302` to the `return` URL (`.../quiz/?pay=success`).
- On decline/abandon → `302` to the `cancel` URL (`.../quiz/?pay=cancel`), optionally
  `&reason=declined|abandoned`.
- Fire the `grant-entitlement` call from the **webhook**, not from the return handler — the user may
  never come back, and the webhook is the provider's authoritative signal.

---

## 6. Plan → KZT map (authoritative; must match HSK)

One-time charge. These values are duplicated in HSK's `data/onboarding.json`; keep them identical.

| `plan` | Amount (KZT) | Term |
|--------|-------------:|------|
| `1mo`  | **39 000**   | 1 month |
| `3mo`  | **54 000**   | 3 months |
| `12mo` | **149 000**  | 12 months |

If these ever change, HSK and StudyBox must change together (the displayed price on HSK must equal
the charged price).

---

## 7. What HSK does with your call (for context)

On a valid `grant-entitlement` call, HSK writes to `profiles.subscription` (jsonb) for `uid`:

```json
{ "status": "active", "plan": "3mo", "price": 54000, "currency": "KZT",
  "interval": "3 months", "provider": "studybox", "order_id": "<your order_id>",
  "paid_at": "<paid_at>", "expires_at": "<paid_at + term, computed by HSK>" }
```

HSK also records a row in a `payments` ledger keyed by `order_id`. You don't need to read either —
they're HSK-internal. `expires_at` is computed on HSK's side from `plan`; you don't send it.

---

## 8. Reliability & idempotency (both sides)

- **Idempotency key = `order_id`** end to end: your acquiring webhook may retry, and HSK's function
  is idempotent by `order_id`. Use one stable `order_id` per acquiring order.
- **Lost/failed grant call:** make it re-drivable — re-POST the same `order_id` with a **fresh `ts`**.
  It resolves to `{"ok":true,"idempotent":true}` if already applied, or grants if not.
- **`entitlement:false` (200):** payment is recorded on HSK but the entitlement write didn't land
  (rare). Alert an operator; a later re-drive (or HSK's manual runbook) reconciles it.
- **Clock:** keep StudyBox's clock in sync (NTP). The ±300 s `ts` window rejects stale/skewed calls;
  don't queue a webhook for more than ~5 minutes before calling without refreshing `ts`.

---

## 9. Config / secrets to obtain from HSK (out-of-band)

- **`HSK_GRANT_URL`** — the exact `grant-entitlement` function URL (HSK provides).
- **`HSK_GRANT_HMAC_SECRET`** — the shared HMAC secret (HSK provides; store as a server secret, never
  in frontend code). Both sides must hold the same value.
- Confirm the target is the **same Supabase project** that backs HSK's auth/profiles.

---

## 10. Test checklist (before HSK flips to production)

- [ ] `/checkout` renders the correct KZT amount per `plan`, prefills email, mobile + one in-app webview.
- [ ] A successful test order calls `grant-entitlement` and returns `200 {"ok":true}`.
- [ ] Re-sending the same `order_id` returns `{"idempotent":true}` (no double grant).
- [ ] A tampered body or wrong secret returns `401` (signing verified).
- [ ] An **unauthenticated** POST (no `Authorization`/`apikey`) reaches the function — the `401` body must be exactly `bad signature`, proving the HMAC gate (not the Supabase JWT gate) is what's running.
- [ ] `stale` `ts`, wrong `currency`, and unknown `plan` each return `400`.
- [ ] Decline/abandon redirects to the `cancel` URL; success redirects to the `return` URL.
- [ ] After a real end-to-end test, HSK confirms `profiles.subscription.status = 'active'` for the `uid`.

---

## 11. Out of scope

- Recurring billing / auto-renew / card-on-file / cancel flows (this is one-time only).
- Refund execution (HSK reserves a status seam but there's no refund webhook yet — coordinate later
  if needed; the acquiring's refund + a future revoke call would be a follow-up).
- Writing anything into HSK's database directly (only the `grant-entitlement` call is permitted).
- HSK's own funnel/UI, analytics, and content gating.
