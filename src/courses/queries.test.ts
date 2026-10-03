import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import { createCourse } from "./create";
import { getTaughtCourse, listRoster, listTaughtCourses } from "./queries";

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
      { id: mine, code: "MINE 1", title: "T", term: "Winter 2027", students: 2, isPractice: false, canvasLinked: false, canvasSyncedAt: null },
    ]);
  });
});

describe("getTaughtCourse and listRoster", () => {
  it("return a course and its roster only to someone who teaches it", async () => {
    const db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const actorFor = async (netId: string): Promise<Actor> => {
      const [{ id }] = await db.query<{ id: string }>(
        "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
        [inst, netId],
      );
      return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
    };
    const prof = await actorFor("prof");
    const other = await actorFor("other");
    const { courseId } = await createCourse(db, prof, {
      creationKey: randomUUID(),
      code: "C 1",
      title: "T",
      term: "W27",
      students: [
        { netId: "zed", name: "Zed", section: "002" },
        { netId: "amy", name: "Amy", section: "001" },
        { netId: "bob", name: null, section: null },
      ],
    });

    expect(await getTaughtCourse(db, prof, courseId)).toMatchObject({ code: "C 1", students: 3 });
    expect(await getTaughtCourse(db, other, courseId)).toBeNull();
    expect(await getTaughtCourse(db, prof, "not-a-uuid")).toBeNull();

    expect((await listRoster(db, prof, courseId)).map((r) => [r.section, r.name])).toEqual([
      ["001", "Amy"],
      ["002", "Zed"],
      [null, "bob"],
    ]);
    expect(await listRoster(db, other, courseId)).toEqual([]);
  });
});

describe("listRoster order", () => {
  it("lists students no longer on the class list last", async () => {
    const db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const [{ id: profId }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'prof', 'prof') returning id",
      [inst],
    );
    const prof: Actor = { userId: profId, institutionId: inst, netId: "prof", displayName: "prof", isStaff: true, isAdmin: false };
    const { courseId } = await createCourse(db, prof, {
      creationKey: randomUUID(),
      code: "C",
      title: "T",
      term: "W",
      students: [
        { netId: "aaa", name: "Aaa", section: "001" },
        { netId: "zzz", name: "Zzz", section: "001" },
      ],
    });
    await db.query(
      "update course_members set status = 'flagged' where user_id = (select id from users where external_id = 'aaa')",
    );
    expect((await listRoster(db, prof, courseId)).map((r) => r.netId)).toEqual(["zzz", "aaa"]);
  });
});
