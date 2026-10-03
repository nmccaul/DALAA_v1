import { describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import { listTaughtCourses } from "./queries";

describe("listTaughtCourses", () => {
  it("lists only the teacher's courses, counting active students", async () => {
    const db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const user = async (netId: string) =>
      (
        await db.query<{ id: string }>(
          "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
          [inst, netId],
        )
      )[0].id;
    const prof = await user("prof");
    const other = await user("other");
    const course = async (code: string, owner: string) => {
      const [{ id }] = await db.query<{ id: string }>(
        "insert into courses (institution_id, code, title, term, created_by) values ($1, $2, 'T', 'Winter 2027', $3) returning id",
        [inst, code, owner],
      );
      await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [id, owner]);
      return id;
    };
    const mine = await course("MINE 1", prof);
    await course("THEIRS 1", other);
    for (const [netId, status] of [["s1", "active"], ["s2", "active"], ["s3", "flagged"]]) {
      await db.query("insert into course_members (course_id, user_id, role, status) values ($1, $2, 'student', $3)", [
        mine,
        await user(netId),
        status,
      ]);
    }

    const actor: Actor = { userId: prof, institutionId: inst, netId: "prof", displayName: "prof", isStaff: true, isAdmin: false };
    expect(await listTaughtCourses(db, actor)).toEqual([
      { id: mine, code: "MINE 1", title: "T", term: "Winter 2027", students: 2 },
    ]);
  });
});
