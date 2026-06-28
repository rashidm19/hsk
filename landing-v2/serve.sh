#!/usr/bin/env bash
# Preview the Prepify-style landing on port 3001 (main app stays on 3000).
cd "$(dirname "$0")"
echo "Landing v2 → http://localhost:3001"
echo "App links   → http://localhost:3000"
python3 -m http.server 3001
