# Migrations

Plain SQL, applied by `npm run migrate` (`src/db/migrations.ts`).

- Name: `YYYYMMDDHHMMSS_lower_snake.sql` (UTC timestamp, e.g. `date -u +%Y%m%d%H%M%S`).
- No `BEGIN`/`COMMIT` — the runner wraps each file in a transaction.
- Never edit an applied migration; the runner refuses a changed checksum. Add a new file.
- Plain Postgres only — no Supabase-only features (D-007), so the database can move.
