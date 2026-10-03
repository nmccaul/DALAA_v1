/**
 * Migrations: plain SQL files in `db/migrations/`, applied in name order and
 * recorded in `schema_migrations`.
 *
 * No ORM and no Supabase-only tooling (D-007): the same runner works against
 * Supabase, a BYU-hosted Postgres, and PGlite in tests.
 *
 * Rules the runner enforces rather than documents:
 * - Names are `YYYYMMDDHHMMSS_lower_snake.sql`. Timestamps, not counters, so two
 *   branches can't both claim `003_`.
 * - **Never edit an applied migration.** Each file's SHA-256 is recorded; a
 *   changed or missing applied file stops the run. Add a new migration instead.
 * - Each file runs in one transaction with its bookkeeping row, so a failure
 *   leaves nothing half-applied. Files must not contain BEGIN/COMMIT.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** The two things the runner needs from a database connection. */
export interface MigrationDb {
  /** Run one or more statements with no parameters. */
  exec(sql: string): Promise<void>;
  query<T>(sql: string): Promise<T[]>;
}

export interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

const NAME = /^\d{14}_[a-z0-9_]+\.sql$/;

export function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => {
      if (!NAME.test(name)) {
        throw new Error(
          `Bad migration name "${name}": expected YYYYMMDDHHMMSS_lower_snake.sql`,
        );
      }
      const sql = readFileSync(join(dir, name), "utf8");
      return { name, sql, checksum: sha256(sql) };
    });
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Applies pending migrations; returns the names applied, in order. */
export async function migrate(
  db: MigrationDb,
  migrations: Migration[],
): Promise<string[]> {
  await db.exec(`
    create table if not exists schema_migrations (
      name       text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    );
    -- Supabase's REST API can see the public schema; with RLS on and no
    -- policies it reads nothing here (same rule as every table, D-007).
    alter table schema_migrations enable row level security;
  `);

  const rows = await db.query<{ name: string; checksum: string }>(
    "select name, checksum from schema_migrations order by name",
  );
  const onDisk = new Map(migrations.map((m) => [m.name, m]));

  for (const row of rows) {
    const file = onDisk.get(row.name);
    if (!file) {
      throw new Error(`Applied migration ${row.name} is missing from disk.`);
    }
    if (file.checksum !== row.checksum) {
      throw new Error(
        `Migration ${row.name} was edited after it was applied. ` +
          "Revert the edit and add a new migration instead.",
      );
    }
  }

  const applied = new Set(rows.map((r) => r.name));
  const done: string[] = [];
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    // name and checksum are safe to inline: NAME and hex were checked above.
    try {
      await db.exec(
        `begin;\n${m.sql}\n;\n` +
          `insert into schema_migrations (name, checksum) values ('${m.name}', '${m.checksum}');\n` +
          "commit;",
      );
    } catch (err) {
      await db.exec("rollback").catch(() => {});
      throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`);
    }
    done.push(m.name);
  }
  return done;
}
