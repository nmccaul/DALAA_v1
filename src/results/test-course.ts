/** A course with a teacher, an outsider, and helpers for activities, students, attempts and grades, for Results tests. */

import type { Actor } from "@/db/scope";
import { testDb } from "@/test/db";

export async function setup() {
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
