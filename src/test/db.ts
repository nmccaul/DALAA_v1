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

/** A fresh in-process Postgres with every migration applied. */
export async function testDb(): Promise<Db & { pg: PGlite }> {
  const pg = new PGlite();
  await migrate(
    {
      exec: async (sql) => {
        await pg.exec(sql);
      },
      query: async <T>(sql: string) => (await pg.query<T>(sql)).rows,
    },
    loadMigrations(migrationsDir),
  );
  return { pg, ...wrap(pg) };
}
