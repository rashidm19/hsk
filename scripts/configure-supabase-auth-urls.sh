#!/usr/bin/env bash
# Update Supabase Auth Site URL + redirect URLs via Management API.
# Requires: SUPABASE_ACCESS_TOKEN from https://supabase.com/dashboard/account/tokens
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-cksziokdhbzpdybwnjsx}"
SITE_URL="${SUPABASE_SITE_URL:-https://www.hskprep.cc}"
REDIRECT_URLS="${SUPABASE_REDIRECT_URLS:-https://www.hskprep.cc/auth/callback.html,http://localhost:3000/auth/callback.html}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Missing SUPABASE_ACCESS_TOKEN."
  echo "Create one at: https://supabase.com/dashboard/account/tokens"
  exit 1
fi

echo "Fetching current auth config..."
curl -s "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  | python3 -m json.tool 2>/dev/null | rg 'site_url|uri_allow_list|external_google_enabled' || true

echo ""
echo "Updating Site URL → ${SITE_URL}"
echo "Redirect URLs → ${REDIRECT_URLS}"

curl -s -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(python3 - <<PY
import json
print(json.dumps({
  "site_url": "${SITE_URL}",
  "uri_allow_list": "${REDIRECT_URLS}",
}))
PY
)" | python3 -m json.tool 2>/dev/null | rg 'site_url|uri_allow_list' || true

echo ""
echo "Done. Verify in Dashboard → Authentication → URL Configuration."
