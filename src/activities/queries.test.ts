import { describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import { listCourseActivities, listStudentAssignments } from "./queries";

describe("listCourseActivities", () => {
  it("lists a course's activities for its teacher, soonest due first, and nothing for anyone else", async () => {
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
    const [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'BUS M 361', 'T', 'Winter 2027', $2) returning id",
      [inst, prof.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [course, prof.userId]);
    const activity = async (title: string, status: string, points: number | null, dueAt: string | null) =>
      (
        await db.query<{ id: string }>(
          `insert into activities (course_id, tool, title, settings, status, points, due_at, created_by)
           values ($1, 'study-chat', $2, '{}', $3, $4, $5, $6) returning id`,
          [course, title, status, points, dueAt, prof.userId],
        )
      )[0].id;
    const undated = await activity("Practice", "draft", null, null);
    const later = await activity("Case 2", "published", 10, "2027-02-10T23:59:00Z");
    const sooner = await activity("Case 1", "published", 12.5, "2027-01-20T23:59:00Z");

    // Finished attempts count as submitted; one still in progress doesn't.
    // Of those, only one with a saved grade counts as graded.
    const attempts: string[] = [];
    for (const [netId, status] of [["s1", "completed"], ["s2", "completed"], ["s3", "in_progress"]] as const) {
      const student = await actorFor(netId);
      const [{ id }] = await db.query<{ id: string }>(
        `insert into attempts (activity_id, user_id, status, ended_by, completed_at)
         values ($1, $2, $3, $4, $5) returning id`,
        [sooner, student.userId, status, status === "completed" ? "student" : null, status === "completed" ? new Date() : null],
      );
      attempts.push(id);
    }
    await db.query(
      `insert into results (attempt_id, status, score, max_score, criteria, touchpoints, feedback, graded_at)
       values ($1, 'graded', 8, 12.5, '[]', '[]', 'Good.', now())`,
      [attempts[0]],
    );
    await db.query("insert into results (attempt_id) values ($1)", [attempts[1]]);

    const rows = await listCourseActivities(db, prof, course);
    expect(rows.map((r) => r.id)).toEqual([sooner, later, undated]);
    expect(rows[0]).toEqual({
      id: sooner,
      tool: "study-chat",
      title: "Case 1",
      status: "published",
      points: 12.5,
      dueAt: new Date("2027-01-20T23:59:00Z"),
      submitted: 2,
      graded: 1,
    });
    expect(rows[1]).toMatchObject({ submitted: 0 });
    expect(rows[2]).toMatchObject({ status: "draft", points: null, dueAt: null });

    expect(await listCourseActivities(db, other, course)).toEqual([]);
    expect(await listCourseActivities(db, prof, "not-a-uuid")).toEqual([]);
  });
});

describe("listStudentAssignments", () => {
  it("lists published assignments in the student's own courses, with their progress, and never drafts", async () => {
    const db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const actorFor = async (netId: string): Promise<Actor> => {
      const [{ id }] = await db.query<{ id: string }>(
        "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
        [inst, netId],
      );
      return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: false, isAdmin: false };
    };
    const prof = await actorFor("prof");
    const sam = await actorFor("sam");
    const kim = await actorFor("kim");
    const course = async (code: string) =>
      (
        await db.query<{ id: string }>(
          "insert into courses (institution_id, code, title, term, created_by) values ($1, $2, 'T', 'Winter 2027', $3) returning id",
          [inst, code, prof.userId],
        )
      )[0].id;
    const mine = await course("BUS M 361");
    const notMine = await course("BUS M 362");
    const flaggedOff = await course("BUS M 363");
    await db.query(
      `insert into course_members (course_id, user_id, role, status)
       values ($1, $3, 'student', 'active'), ($1, $4, 'student', 'active'), ($2, $3, 'student', 'flagged')`,
      [mine, flaggedOff, sam.userId, kim.userId],
    );
    const activity = async (courseId: string, title: string, status: string, dueAt: string | null) =>
      (
        await db.query<{ id: string }>(
          `insert into activities (course_id, tool, title, settings, status, points, due_at, created_by)
           values ($1, 'study-chat', $2, '{}', $3, 10, $4, $5) returning id`,
          [courseId, title, status, dueAt, prof.userId],
        )
      )[0].id;
    const fresh = await activity(mine, "Not started", "published", null);
    const going = await activity(mine, "Going", "published", "2027-01-10T23:59:00Z");
    const finished = await activity(mine, "Finished", "published", "2027-01-20T23:59:00Z");
    const graded = await activity(mine, "Graded", "published", "2027-01-30T23:59:00Z");
    await activity(mine, "Draft", "draft", "2027-01-01T23:59:00Z");
    await activity(notMine, "Someone else's", "published", null);
    await activity(flaggedOff, "Flagged off", "published", null);

    const attempt = async (activityId: string, user: Actor, done: boolean) =>
      (
        await db.query<{ id: string }>(
          `insert into attempts (activity_id, user_id, status, ended_by, completed_at)
           values ($1, $2, $3, $4, $5) returning id`,
          [activityId, user.userId, done ? "completed" : "in_progress", done ? "student" : null, done ? new Date() : null],
        )
      )[0].id;
    await attempt(going, sam, false);
    const grading = await attempt(finished, sam, true);
    await db.query("insert into results (attempt_id) values ($1)", [grading]);
    const done = await attempt(graded, sam, true);
    await db.query(
      `insert into results (attempt_id, status, score, max_score, criteria, touchpoints, feedback, graded_at)
       values ($1, 'graded', 7.5, 10, '[]', '[]', 'Good.', now())`,
      [done],
    );
    // Kim's grade on the same assignment isn't Sam's.
    const kims = await attempt(fresh, kim, true);
    await db.query(
      `insert into results (attempt_id, status, score, max_score, criteria, touchpoints, feedback, graded_at)
       values ($1, 'graded', 9, 10, '[]', '[]', 'Good.', now())`,
      [kims],
    );

    const rows = await listStudentAssignments(db, sam);
    expect(rows.map((r) => [r.title, r.status, r.score, r.maxScore])).toEqual([
      ["Going", "in_progress", null, null],
      ["Finished", "submitted", null, null],
      ["Graded", "graded", 7.5, 10],
      ["Not started", "not_started", null, null],
    ]);
    expect(rows[0]).toMatchObject({ id: going, courseId: mine, tool: "study-chat", points: 10, dueAt: new Date("2027-01-10T23:59:00Z") });

    expect((await listStudentAssignments(db, kim)).find((r) => r.id === fresh)).toMatchObject({ status: "graded", score: 9 });
    expect(await listStudentAssignments(db, prof)).toEqual([]);
  });
});
