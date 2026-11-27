import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { deleteActivity, deleteFacts, deleteImpact } from "./delete";
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

describe("deleteFacts", () => {
  it("says nothing changes in Canvas and nobody started, for a fresh draft", () => {
    expect(deleteFacts({ assigned: false, started: 0, submitted: 0 })).toEqual({
      facts: [
        "It's deleted for good.",
        "No students have started it.",
        "It isn't in Canvas, so nothing changes there.",
        "Its materials stay in Materials.",
      ],
      mustTick: undefined,
    });
  });

  it("says what stays in Canvas and how many students started and finished", () => {
    const { facts, mustTick } = deleteFacts({ assigned: true, started: 3, submitted: 2 });
    expect(facts).toContain("3 students started it, and 2 finished. Their chats and grades in DALAA are deleted with it.");
    expect(facts.join(" ")).toMatch(/DALAA doesn't delete the Canvas assignment: delete it in Canvas too/);
    expect(facts.join(" ")).toMatch(/Grades already sent to Canvas stay there/);
    expect(mustTick).toBe("Also delete 3 students' chats and grades. This can't be undone.");
  });

  it("words one student, and everyone finished", () => {
    expect(deleteFacts({ assigned: false, started: 1, submitted: 0 }).facts[1]).toBe(
      "1 student started it. Their chats and grades in DALAA are deleted with it.",
    );
    expect(deleteFacts({ assigned: false, started: 1, submitted: 1 }).mustTick).toBe("Also delete 1 student's chats and grades. This can't be undone.");
    expect(deleteFacts({ assigned: false, started: 2, submitted: 2 }).facts[1]).toMatch(/^2 students started it, and all finished\./);
  });
});

describe("deleteImpact", () => {
  it("counts started and finished attempts", async () => {
    const db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const [{ id: user }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'p', 'p') returning id",
      [inst],
    );
    const [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'F26', $2) returning id",
      [inst, user],
    );
    const [{ id: activity }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, status, created_by)
       values ($1, 'study-chat', 'A', '{}', 'draft', $2) returning id`,
      [course, user],
    );
    expect(await deleteImpact(db, activity)).toEqual({ started: 0, submitted: 0 });
    for (const [netId, done] of [["s1", true], ["s2", false]] as const) {
      const [{ id: s }] = await db.query<{ id: string }>(
        "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
        [inst, netId],
      );
      await db.query(
        done
          ? "insert into attempts (activity_id, user_id, status, ended_by, completed_at) values ($1, $2, 'completed', 'student', now())"
          : "insert into attempts (activity_id, user_id) values ($1, $2)",
        [activity, s],
      );
    }
    expect(await deleteImpact(db, activity)).toEqual({ started: 2, submitted: 1 });
  });
});
