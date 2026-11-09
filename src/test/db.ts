import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { loadMigrations, migrate } from "@/db/migrations";
import type { Db } from "@/db/types";

type Conn = Pick<PGlite, "query"> & { transaction?: PGlite["transaction"] };

function wrap(conn: Conn): Db {
  return {
    query: async <T>(text: string, values: readonly unknown[] = []) =>
      (await conn.query<T>(text, values as unknown[])).rows,
    transaction: async <T>(fn: (tx: Db) => Promise<T>) =>
      conn.transaction ? conn.transaction((tx) => fn(wrap(tx))) : fn(wrap(conn)),
  };
}

const migrationsDir = fileURLToPath(new URL("../../db/migrations", import.meta.url));

function runner(pg: PGlite) {
  return {
    exec: async (sql: string) => {
      await pg.exec(sql);
    },
    query: async <T>(sql: string) => (await pg.query<T>(sql)).rows,
  };
}

/**
 * A fresh in-process Postgres with every migration applied, or only those
 * named before `before` (to test a migration's backfill: insert old-shape
 * rows, then `migrateRest()`).
 */
export async function testDb(
  options: { before?: string } = {},
): Promise<Db & { pg: PGlite; migrateRest: () => Promise<string[]> }> {
  const pg = new PGlite();
  const all = loadMigrations(migrationsDir);
  const before = options.before;
  await migrate(runner(pg), before ? all.filter((m) => m.name < before) : all);
  return { pg, ...wrap(pg), migrateRest: () => migrate(runner(pg), all) };
}
