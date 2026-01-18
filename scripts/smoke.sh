#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:3333}"

echo "1) Typecheck"
npx tsc --noEmit

echo "2) Health"
curl -fsS "$API_URL/health" && echo

echo "3) Get Firebase ID token"
TOKEN="$(node --import ./scripts/register-ts-node.mjs scripts/getIdToken.ts | tail -n 1)"
if [[ -z "${TOKEN:-}" ]]; then
  echo "ERROR: token was empty. Check TEST_EMAIL/TEST_PASSWORD + FIREBASE_* in .env"
  exit 1
fi
echo "token=OK (len=${#TOKEN})"

auth_curl() {
  curl -fsS \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    "$@"
}

echo "4) Dashboard (authed)"
auth_curl "$API_URL/dashboard" | head -c 400; echo; echo

echo "5) Events count + last event (authed + safe)"
auth_curl "$API_URL/events" | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  let j;
  try { j = JSON.parse(d); } catch (e) { console.error('Invalid JSON:', d.slice(0,200)); process.exit(1); }
  const events = Array.isArray(j.events) ? j.events : [];
  console.log('count=', j.count ?? events.length);
  console.log('last=', events.length ? events[events.length-1] : null);
})"
