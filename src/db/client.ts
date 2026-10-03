/**
 * The app's one Postgres connection pool. Server-only: the browser never talks
 * to the database (D-007).
 *
 * `prepare: false` because Supabase's pooled URL (port 6543, transaction mode)
 * can't hold prepared statements across transactions. It costs little and keeps
 * the same code working against a direct or BYU-hosted Postgres.
 */

import postgres from "postgres";

let pool: postgres.Sql | undefined;

export function db(): postgres.Sql {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = postgres(url, { prepare: false, max: 5 });
  }
  return pool;
}
