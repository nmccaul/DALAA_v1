#!/usr/bin/env bash
# Applies db/migrations/ to production (README: "apply it to production first").
# Pulls production's env into a private temp file, uses only
# POSTGRES_URL_NON_POOLING, runs `npm run migrate`, deletes the file.
# Never prints the URL. Needs the DALAA Vercel login (~/.vercel-dalaa).
set -euo pipefail
cd "$(dirname "$0")/.."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
chmod 700 "$tmp"

vercel -Q ~/.vercel-dalaa env pull "$tmp/prod.env" --environment=production --yes >/dev/null 2>&1 \
  || { echo "Couldn't pull production env (is the DALAA Vercel login set up?)" >&2; exit 1; }
url="$(grep '^POSTGRES_URL_NON_POOLING=' "$tmp/prod.env" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
[ -n "$url" ] || { echo "POSTGRES_URL_NON_POOLING isn't set in production" >&2; exit 1; }

echo "Applying migrations to production…"
DATABASE_URL="$url" npm run -s migrate
