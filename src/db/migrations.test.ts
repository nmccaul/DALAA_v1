import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { loadMigrations, migrate, sha256, type Migration, type MigrationDb } from "./migrations";

function pgliteDb(pg: PGlite): MigrationDb {
  return {
    exec: async (sql) => {
      await pg.exec(sql);
    },
    query: async <T>(sql: string) => (await pg.query<T>(sql)).rows,
  };
}

function m(name: string, sql: string): Migration {
  return { name, sql, checksum: sha256(sql) };
}

const first = m("20261003000000_widgets.sql", "create table widgets (id int primary key);");
const second = m("20261003000100_gadgets.sql", "create table gadgets (id int primary key);");

describe("migrate", () => {
  let pg: PGlite;
  let db: MigrationDb;

  beforeEach(() => {
    pg = new PGlite();
    db = pgliteDb(pg);
  });

  it("applies pending migrations in order, once", async () => {
    expect(await migrate(db, [first, second])).toEqual([first.name, second.name]);
    expect(await migrate(db, [first, second])).toEqual([]);
    await pg.exec("insert into widgets values (1); insert into gadgets values (1);");
  });

  it("locks its own bookkeeping table with row-level security", async () => {
    await migrate(db, [first]);
    const [row] = await db.query<{ on: boolean }>(
      "select relrowsecurity as on from pg_class where relname = 'schema_migrations'",
    );
    expect(row.on).toBe(true);
  });

  it("refuses a migration edited after it was applied", async () => {
    await migrate(db, [first]);
    const edited = m(first.name, "create table widgets (id bigint primary key);");
    await expect(migrate(db, [edited])).rejects.toThrow(/edited after it was applied/);
  });

  it("refuses when an applied migration is missing from disk", async () => {
    await migrate(db, [first]);
    await expect(migrate(db, [second])).rejects.toThrow(/missing from disk/);
  });

  it("leaves nothing behind when a migration fails", async () => {
    const broken = m(
      "20261003000200_broken.sql",
      "create table half (id int); select * from no_such_table;",
    );
    await expect(migrate(db, [first, broken])).rejects.toThrow(/broken.sql failed/);

    const tables = await db.query<{ name: string }>(
      "select table_name as name from information_schema.tables where table_name = 'half'",
    );
    expect(tables).toEqual([]);
    const recorded = await db.query<{ name: string }>("select name from schema_migrations");
    expect(recorded.map((r) => r.name)).toEqual([first.name]);
  });
});

describe("loadMigrations", () => {
  it("reads files in name order with checksums", () => {
    const dir = mkdtempSync(join(tmpdir(), "dalaa-mig-"));
    writeFileSync(join(dir, second.name), second.sql);
    writeFileSync(join(dir, first.name), first.sql);
    writeFileSync(join(dir, "README.md"), "ignored");
    expect(loadMigrations(dir)).toEqual([first, second]);
  });

  it("rejects counter-style names", () => {
    const dir = mkdtempSync(join(tmpdir(), "dalaa-mig-"));
    writeFileSync(join(dir, "003_users.sql"), "select 1;");
    expect(() => loadMigrations(dir)).toThrow(/Bad migration name/);
  });
});
