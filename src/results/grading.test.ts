import { describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import { listStudentAssignments } from "@/activities/queries";
import { getResult } from "./store";
import { latestDispute, openDispute, resolveDispute } from "./disputes";
import { listCourseGrades, setTeacherScore } from "./grading";

async function setup() {
  const db = await testDb();
  const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
  const actorFor = async (netId: string, name = netId, isStaff = true): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $3) returning id",
      [inst, netId, name],
    );
    return { userId: id, institutionId: inst, netId, displayName: name, isStaff, isAdmin: false };
  };
  const prof = await actorFor("prof");
  const other = await actorFor("other");
  const [{ id: course }] = await db.query<{ id: string }>(
    "insert into courses (institution_id, code, title, term, created_by) values ($1, 'BUS M 361', 'T', 'Winter 2027', $2) returning id",
    [inst, prof.userId],
  );
  await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [course, prof.userId]);
  const activity = async (title: string, status: string, dueAt: string | null) =>
    (
      await db.query<{ id: string }>(
        `insert into activities (course_id, tool, title, settings, status, points, due_at, created_by)
         values ($1, 'study-chat', $2, '{}', $3, 10, $4, $5) returning id`,
        [course, title, status, dueAt, prof.userId],
      )
    )[0].id;
  const student = async (netId: string, name: string, memberStatus = "active") => {
    const s = await actorFor(netId, name, false);
    await db.query("insert into course_members (course_id, user_id, role, status) values ($1, $2, 'student', $3)", [
      course,
      s.userId,
      memberStatus,
    ]);
    return s;
  };
  const attempt = async (activityId: string, s: Actor, completed: boolean) =>
    (
      await db.query<{ id: string }>(
        `insert into attempts (activity_id, user_id, status, ended_by, completed_at)
         values ($1, $2, $3, $4, $5) returning id`,
        [activityId, s.userId, completed ? "completed" : "in_progress", completed ? "student" : null, completed ? new Date() : null],
      )
    )[0].id;
  const grade = (attemptId: string, score: number) =>
    db.query(
      `insert into results (attempt_id, status, score, max_score, criteria, touchpoints, feedback, graded_at)
       values ($1, 'graded', $2, 10, '[{"label":"Q","score":${score},"max":10,"evidence":null,"feedback":"Ok."}]', '[]', 'Good.', now())`,
      [attemptId, score],
    );
  return { db, prof, other, course, activity, student, attempt, grade };
}

describe("listCourseGrades", () => {
  it("lists each published assignment with every student's status and scores, for its teacher only", async () => {
    const { db, prof, other, course, activity, student, attempt, grade } = await setup();
    const later = await activity("Case 2", "published", "2027-02-10T23:59:00Z");
    const sooner = await activity("Case 1", "published", "2027-01-20T23:59:00Z");
    await activity("Draft", "draft", null);
    const ana = await student("ana", "Ana");
    const ben = await student("ben", "Ben");
    const cy = await student("cy", "Cy");
    const gone = await student("gone", "Dee", "flagged");
    await student("left", "Eve", "flagged");

    const graded = await attempt(sooner, ana, true);
    await grade(graded, 7);
    const submitted = await attempt(sooner, ben, true);
    await db.query("insert into results (attempt_id) values ($1)", [submitted]);
    await attempt(sooner, cy, false);
    await attempt(sooner, gone, true);

    const rows = await listCourseGrades(db, prof, course);
    expect(rows.map((r) => r.activityId)).toEqual([sooner, later]);
    expect(rows[0].students.map((s) => [s.name, s.status, s.aiScore, s.teacherScore, s.maxScore, s.flagged])).toEqual([
      ["Ana", "graded", 7, null, 10, false],
      ["Ben", "submitted", null, null, null, false],
      ["Cy", "in_progress", null, null, null, false],
      ["Dee", "submitted", null, null, null, true],
    ]);
    // Flagged off the class list with no attempt: not listed. Not started: listed, no attempt.
    expect(rows[1].students.map((s) => [s.name, s.status, s.attemptId])).toEqual([
      ["Ana", "not_started", null],
      ["Ben", "not_started", null],
      ["Cy", "not_started", null],
    ]);

    expect(await listCourseGrades(db, other, course)).toEqual([]);
    expect(await listCourseGrades(db, prof, "not-a-uuid")).toEqual([]);
  });
});

describe("listCourseGrades and Canvas Student View", () => {
  it("keeps Student View users, marked and listed last", async () => {
    const { db, prof, course, activity, student } = await setup();
    const a = await activity("Case 1", "published", null);
    const sv = await student("a1b2c3", "Test Student");
    await db.query("update course_members set student_view = true where user_id = $1", [sv.userId]);
    await student("zed", "Zed");
    const [row] = await listCourseGrades(db, prof, course);
    expect(row.activityId).toBe(a);
    expect(row.students.map((s) => [s.name, s.studentView])).toEqual([
      ["Zed", false],
      ["Test Student", true],
    ]);
  });
});

describe("setTeacherScore", () => {
  it("keeps the grader's score, makes the teacher's count, and can put the grader's back", async () => {
    const { db, prof, course, activity, student, attempt, grade } = await setup();
    const a = await activity("Case 1", "published", null);
    const ana = await student("ana", "Ana");
    const graded = await attempt(a, ana, true);
    await grade(graded, 7);

    expect(await setTeacherScore(db, prof, graded, 9.5)).toBe("saved");
    expect(await getResult(db, graded)).toMatchObject({ score: 7, teacherScore: 9.5, maxScore: 10 });
    expect((await listStudentAssignments(db, ana))[0]).toMatchObject({ status: "graded", score: 9.5, maxScore: 10 });
    expect((await listCourseGrades(db, prof, course))[0].students[0]).toMatchObject({ aiScore: 7, teacherScore: 9.5 });
    const [who] = await db.query<{ by: string }>("select teacher_scored_by as by from results where attempt_id = $1", [graded]);
    expect(who.by).toBe(prof.userId);

    expect(await setTeacherScore(db, prof, graded, null)).toBe("saved");
    expect(await getResult(db, graded)).toMatchObject({ score: 7, teacherScore: null });
    expect((await listStudentAssignments(db, ana))[0]).toMatchObject({ score: 7 });
  });

  it("refuses scores out of range, attempts not graded yet, and other teachers", async () => {
    const { db, prof, other, activity, student, attempt, grade } = await setup();
    const a = await activity("Case 1", "published", null);
    const graded = await attempt(a, await student("ana", "Ana"), true);
    await grade(graded, 7);
    const ungraded = await attempt(a, await student("ben", "Ben"), true);

    for (const bad of [-1, 10.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await setTeacherScore(db, prof, graded, bad)).toBe("out_of_range");
    }
    expect(await setTeacherScore(db, prof, graded, 0)).toBe("saved");
    expect(await getResult(db, graded)).toMatchObject({ score: 7, teacherScore: 0 });

    expect(await setTeacherScore(db, prof, ungraded, 5)).toBe("not_found");
    expect(await setTeacherScore(db, other, graded, 10)).toBe("not_found");
    expect(await setTeacherScore(db, prof, "not-a-uuid", 1)).toBe("not_found");
    expect(await getResult(db, graded)).toMatchObject({ teacherScore: 0 });
  });

  it("can't be set on an ungraded result even by hand", async () => {
    const { db, activity, student, attempt } = await setup();
    const a = await activity("Case 1", "published", null);
    const t = await attempt(a, await student("ana", "Ana"), true);
    await db.query("insert into results (attempt_id) values ($1)", [t]);
    await expect(db.query("update results set teacher_score = 1, teacher_scored_at = now() where attempt_id = $1", [t])).rejects.toThrow();
  });
});

describe("disputes", () => {
  const key = () => crypto.randomUUID();

  it("lets a student dispute their own graded attempt once at a time, and a resent form opens nothing new", async () => {
    const { db, prof, course, activity, student, attempt, grade } = await setup();
    const a = await activity("Case 1", "published", null);
    const ana = await student("ana", "Ana");
    const ben = await student("ben", "Ben");
    const graded = await attempt(a, ana, true);
    await grade(graded, 7);
    const ungraded = await attempt(a, ben, true);

    expect(await openDispute(db, ana, graded, "   ", key())).toBe("no_reason");
    expect(await openDispute(db, ana, graded, "x".repeat(2001), key())).toBe("no_reason");
    expect(await openDispute(db, ben, graded, "Not mine", key())).toBe("not_found");
    expect(await openDispute(db, ben, ungraded, "Not graded", key())).toBe("not_found");
    expect(await openDispute(db, prof, graded, "Teacher", key())).toBe("not_found");

    const k = key();
    expect(await openDispute(db, ana, graded, "  I named the cash flow risk.  ", k)).toBe("opened");
    expect(await openDispute(db, ana, graded, "I named the cash flow risk.", k)).toBe("opened");
    expect(await openDispute(db, ana, graded, "And another thing", key())).toBe("already_open");
    expect(await db.query("select 1 from disputes")).toHaveLength(1);
    expect(await latestDispute(db, graded)).toMatchObject({ status: "open", reason: "I named the cash flow risk.", response: null });

    const [row] = (await listCourseGrades(db, prof, course))[0].students;
    expect(row).toMatchObject({ name: "Ana", disputeReason: "I named the cash flow risk." });
    expect(row.disputeId).toBe((await latestDispute(db, graded))!.id);
  });

  it("a flagged student can't dispute", async () => {
    const { db, activity, student, attempt, grade } = await setup();
    const a = await activity("Case 1", "published", null);
    const gone = await student("gone", "Dee", "flagged");
    const graded = await attempt(a, gone, true);
    await grade(graded, 7);
    expect(await openDispute(db, gone, graded, "Please look", key())).toBe("not_found");
  });

  it("the teacher resolves with or without a new score, and the student may dispute again after", async () => {
    const { db, prof, other, course, activity, student, attempt, grade } = await setup();
    const a = await activity("Case 1", "published", null);
    const ana = await student("ana", "Ana");
    const graded = await attempt(a, ana, true);
    await grade(graded, 7);
    await openDispute(db, ana, graded, "Please look again", key());
    const { id } = (await latestDispute(db, graded))!;

    expect(await resolveDispute(db, other, id, 9, "")).toBe("not_found");
    expect(await resolveDispute(db, prof, id, 11, "")).toBe("out_of_range");
    expect(await latestDispute(db, graded)).toMatchObject({ status: "open" });

    // Keeping the score that counts sets no teacher score.
    expect(await resolveDispute(db, prof, id, 7, "  The grade stands.  ")).toBe("resolved");
    expect(await getResult(db, graded)).toMatchObject({ score: 7, teacherScore: null });
    expect(await latestDispute(db, graded)).toMatchObject({ status: "resolved", response: "The grade stands." });
    expect((await listCourseGrades(db, prof, course))[0].students[0]).toMatchObject({ disputeId: null, disputeReason: null });
    // Resent: nothing changes.
    expect(await resolveDispute(db, prof, id, 10, "Changed my mind")).toBe("resolved");
    expect(await getResult(db, graded)).toMatchObject({ teacherScore: null });
    expect(await latestDispute(db, graded)).toMatchObject({ response: "The grade stands." });

    expect(await openDispute(db, ana, graded, "Second look?", key())).toBe("opened");
    const second = (await latestDispute(db, graded))!;
    expect(second).toMatchObject({ status: "open", reason: "Second look?" });
    expect(await resolveDispute(db, prof, second.id, 8.5, "")).toBe("resolved");
    expect(await getResult(db, graded)).toMatchObject({ score: 7, teacherScore: 8.5 });
    expect(await latestDispute(db, graded)).toMatchObject({ status: "resolved", response: null });
  });

  it("allows only one open dispute per attempt even by hand", async () => {
    const { db, activity, student, attempt, grade } = await setup();
    const a = await activity("Case 1", "published", null);
    const graded = await attempt(a, await student("ana", "Ana"), true);
    await grade(graded, 7);
    await db.query("insert into disputes (attempt_id, client_key, reason) values ($1, $2, 'One')", [graded, key()]);
    await expect(
      db.query("insert into disputes (attempt_id, client_key, reason) values ($1, $2, 'Two')", [graded, key()]),
    ).rejects.toThrow();
  });
});
