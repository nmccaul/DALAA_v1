/**
 * The app's one Postgres connection pool. Server-only: the browser never talks
 * to the database (D-007).
 *
 * `prepare: false` because Supabase's pooled URL (port 6543, transaction mode)
 * can't hold prepared statements across transactions. It costs little and keeps
 * the same code working against a direct or BYU-hosted Postgres.
 */

import postgres from "postgres";
import type { Db } from "./types";

let pool: postgres.Sql | undefined;

function sql(): postgres.Sql {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = postgres(url, { prepare: false, max: 5 });
  }
  return pool;
}

export function db(): Db {
  return {
    query: async <T>(text: string, values: readonly unknown[] = []) =>
      (await sql().unsafe(text, values as postgres.ParameterOrJSON<never>[])) as unknown as T[],
  };
}
