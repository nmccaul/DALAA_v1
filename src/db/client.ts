/**
 * The app's one Postgres connection pool. Server-only: the browser never talks
 * to the database (D-007).
 *
 * `prepare: false` because Supabase's pooled URL (port 6543, transaction mode)
 * can't hold prepared statements across transactions. It costs little and keeps
 * the same code working against a direct or BYU-hosted Postgres.
 *
 * DATABASE_POOL_MAX (default 5) caps connections per server instance; keep it
 * small on serverless, where every instance opens its own pool.
 */

import postgres from "postgres";
import type { Db } from "./types";

let pool: postgres.Sql | undefined;

function sql(): postgres.Sql {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = postgres(url, { prepare: false, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
  }
  return pool;
}

function wrap(conn: postgres.Sql | postgres.TransactionSql): Db {
  return {
    query: async <T>(text: string, values: readonly unknown[] = []) =>
      (await conn.unsafe(text, values as postgres.ParameterOrJSON<never>[])) as unknown as T[],
    transaction: async <T>(fn: (tx: Db) => Promise<T>) => {
      if (!("begin" in conn)) return fn(wrap(conn)); // already inside one
      return (await conn.begin((tx) => fn(wrap(tx)))) as T;
    },
  };
}

export function db(): Db {
  return wrap(sql());
}
