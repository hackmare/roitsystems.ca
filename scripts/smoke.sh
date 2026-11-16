#!/usr/bin/env bash
# Start the site and fetch what a visitor fetches: the home page, the blog
# list and one blog post. Fails on a crash at start, a non-200 answer, or a
# blog list with no posts. Used by CI (.github/workflows/ci.yml); runs locally
# after `npm ci` with:  bash scripts/smoke.sh
set -euo pipefail

PORT="${SMOKE_PORT:-18080}"
BASE="http://127.0.0.1:${PORT}"
LOG="$(mktemp)"

PORT="$PORT" node server.js >"$LOG" 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; rm -f "$LOG"; }
trap cleanup EXIT

# Up to 15 s for the server to answer.
for _ in $(seq 1 50); do
  if curl -fs -o /dev/null --max-time 2 "$BASE/"; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "server exited at start:"; cat "$LOG"; exit 1
  fi
  sleep 0.3
done

fetch() {  # fetch <path> : 200 or fail, body on stdout
  local code
  code="$(curl -s -o /tmp/smoke-body --max-time 10 -w '%{http_code}' "$BASE$1")"
  if [[ "$code" != "200" ]]; then
    echo "GET $1 answered $code"; cat "$LOG"; exit 1
  fi
  cat /tmp/smoke-body
}

fetch / >/dev/null
echo "ok  GET /"
posts="$(fetch /api/blog)"
first="$(node -e 'const d=JSON.parse(process.argv[1]);const all=Object.values(d.sections||{}).flat();if(!all.length){process.exit(1)}console.log(all[0].path)' "$posts")" \
  || { echo "GET /api/blog listed no posts"; exit 1; }
echo "ok  GET /api/blog ($(node -e 'const d=JSON.parse(process.argv[1]);console.log(Object.values(d.sections).flat().length)' "$posts") posts)"
fetch "/blog/${first}" | grep -q "<html" || { echo "GET /blog/${first} is not a page"; exit 1; }
echo "ok  GET /blog/${first}"
