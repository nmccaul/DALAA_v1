import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Db } from "./types";

// The rules the core migration makes impossible to break.
describe("core schema", () => {
  let db: Db;
  let inst: string;
  let prof: string;

  beforeAll(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    [{ id: prof }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'prof', 'Prof') returning id",
      [inst],
    );
  });

  const addUser = (netId: string) =>
    db.query("insert into users (institution_id, external_id, display_name) values ($1, $2, 'x')", [
      inst,
      netId,
    ]);

  it("stores NetIDs lowercase only, so one person can't become two", async () => {
    await expect(addUser("JDoe")).rejects.toThrow(/check constraint/);
    await expect(addUser("")).rejects.toThrow(/check constraint/);
    await addUser("jdoe");
    await expect(addUser("jdoe")).rejects.toThrow(/duplicate key/);
  });

  it("gives an email to one account only, ignoring case; no email is unconstrained", async () => {
    const withEmail = (netId: string, email: string | null) =>
      db.query("insert into users (institution_id, external_id, display_name, email) values ($1, $2, 'x', $3)", [
        inst,
        netId,
        email,
      ]);
    await withEmail("e1", "Ann@School.edu");
    await expect(withEmail("e2", "ann@school.edu")).rejects.toThrow(/duplicate key/);
    await withEmail("e3", null);
    await withEmail("e4", null);
  });

  it("refuses to put a student in another course's section", async () => {
    const course = async (code: string) =>
      (
        await db.query<{ id: string }>(
          "insert into courses (institution_id, code, title, term, created_by) values ($1, $2, $2, 'W27', $3) returning id",
          [inst, code, prof],
        )
      )[0].id;
    const a = await course("A");
    const b = await course("B");
    const [{ id: sectionOfB }] = await db.query<{ id: string }>(
      "insert into sections (course_id, name) values ($1, '001') returning id",
      [b],
    );
    await expect(
      db.query(
        "insert into course_members (course_id, user_id, role, section_id) values ($1, $2, 'student', $3)",
        [a, prof, sectionOfB],
      ),
    ).rejects.toThrow(/foreign key/);
  });
});
