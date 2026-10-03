import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Db } from "@/db/types";
import { admit, loadActor } from "./admit";

describe("admit", () => {
  let db: Db;
  let inst: string;

  beforeEach(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
  });

  const allow = (netId: string, isAdmin = false) =>
    db.query("insert into staff_allowlist (institution_id, external_id, is_admin) values ($1, $2, $3)", [
      inst,
      netId,
      isAdmin,
    ]);

  async function enrol(netId: string, status = "active") {
    const [prof] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'prof', 'Prof') returning id",
      [inst],
    );
    const [course] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, prof.id],
    );
    const [stu] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, 'Student') returning id",
      [inst, netId],
    );
    await db.query(
      "insert into course_members (course_id, user_id, role, status) values ($1, $2, 'student', $3)",
      [course.id, stu.id, status],
    );
    return stu.id;
  }

  it("creates a staff account on first sign-in, and reuses it after", async () => {
    await allow("prof1");
    const first = await admit(db, inst, { netId: " Prof1 ", displayName: "Dr. One" });
    const again = await admit(db, inst, { netId: "prof1" });
    expect(first.ok && again.ok && first.userId === again.userId).toBe(true);
    const [user] = await db.query<{ display_name: string }>("select display_name from users");
    expect(user.display_name).toBe("Dr. One"); // a blank name didn't overwrite it
  });

  it("signs in a student who is on a roster, by NetID", async () => {
    const id = await enrol("stu1");
    expect(await admit(db, inst, { netId: "STU1" })).toEqual({ ok: true, userId: id });
  });

  it("refuses strangers and flagged students, and never creates them", async () => {
    await enrol("gone", "flagged");
    expect(await admit(db, inst, { netId: "stranger" })).toEqual({ ok: false, reason: "not-on-roster" });
    expect(await admit(db, inst, { netId: "gone" })).toEqual({ ok: false, reason: "not-on-roster" });
    expect(await db.query("select 1 from users where external_id = 'stranger'")).toEqual([]);
  });

  it("refuses a malformed NetID", async () => {
    expect(await admit(db, inst, { netId: "a b" })).toEqual({ ok: false, reason: "bad-netid" });
    expect(await admit(db, inst, { netId: "   " })).toEqual({ ok: false, reason: "bad-netid" });
  });

  it("reads staff and admin status fresh, so removal takes effect at once", async () => {
    await allow("boss", true);
    const signedIn = await admit(db, inst, { netId: "boss" });
    if (!signedIn.ok) throw new Error("expected admission");
    expect(await loadActor(db, signedIn.userId)).toMatchObject({ isStaff: true, isAdmin: true });
    await db.query("delete from staff_allowlist where external_id = 'boss'");
    expect(await loadActor(db, signedIn.userId)).toMatchObject({ isStaff: false, isAdmin: false });
  });
});
