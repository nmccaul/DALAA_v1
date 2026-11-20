import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { deleteActivity } from "./delete";
import { setActivityMaterials } from "./materials";

describe("deleteActivity", () => {
  let db: Db;
  let inst: string;
  let prof: Actor;
  let other: Actor;
  let course: string;
  let activity: string;
  let reading: string;

  const actor = async (netId: string): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
  };
  const count = async (sql: string, values: unknown[]) => (await db.query<{ n: number }>(sql, values))[0].n;
  const activityExists = () => count("select count(*)::int as n from activities where id = $1", [activity]);

  beforeEach(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    prof = await actor("prof");
    other = await actor("other");
    [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'F26', $2) returning id",
      [inst, prof.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [course, prof.userId]);
    [{ id: reading }] = await db.query<{ id: string }>(
      `insert into course_content (course_id, source, name, body, creation_key, created_by)
       values ($1, 'paste', 'Case', 'Case body', $2, $3) returning id`,
      [course, randomUUID(), prof.userId],
    );
    [{ id: activity }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, points, status, created_by)
       values ($1, 'study-chat', 'Harbor Bikes', '{}', 10, 'published', $2) returning id`,
      [course, prof.userId],
    );
    expect(await setActivityMaterials(db, prof, activity, { contentIds: [reading], guideIds: [] })).toEqual({ ok: true });
  });

  it("deletes an activity nobody has started, and keeps its materials in the course", async () => {
    expect(await deleteActivity(db, prof, activity, false)).toEqual({ ok: true, courseId: course });
    expect(await activityExists()).toBe(0);
    expect(await count("select count(*)::int as n from activity_materials where activity_id = $1", [activity])).toBe(0);
    expect(await count("select count(*)::int as n from course_content where id = $1", [reading])).toBe(1);
  });

  it("won't delete students' work unless the teacher says so, then deletes it all", async () => {
    const student = await actor("student");
    const [{ id: attempt }] = await db.query<{ id: string }>(
      `insert into attempts (activity_id, user_id, status, ended_by, completed_at)
       values ($1, $2, 'completed', 'student', now()) returning id`,
      [activity, student.userId],
    );
    await db.query("insert into results (attempt_id) values ($1)", [attempt]);

    expect(await deleteActivity(db, prof, activity, false)).toEqual({
      ok: false,
      reason: "1 student has started it. Tick the box to delete their work too.",
    });
    expect(await activityExists()).toBe(1);

    expect(await deleteActivity(db, prof, activity, true)).toEqual({ ok: true, courseId: course });
    expect(await activityExists()).toBe(0);
    expect(await count("select count(*)::int as n from attempts where id = $1", [attempt])).toBe(0);
    expect(await count("select count(*)::int as n from results where attempt_id = $1", [attempt])).toBe(0);
  });

  it("refuses someone who doesn't teach the course, and a second delete", async () => {
    expect(await deleteActivity(db, other, activity, true)).toMatchObject({ ok: false });
    expect(await activityExists()).toBe(1);
    expect(await deleteActivity(db, prof, activity, true)).toMatchObject({ ok: true });
    expect(await deleteActivity(db, prof, activity, true)).toMatchObject({ ok: false });
  });
});
