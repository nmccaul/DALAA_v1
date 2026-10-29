/**
 * Activities across every tool (db/migrations/*_activities.sql), as the
 * chassis lists them. Nothing here reads a tool's settings.
 */

import { and, coursesTaughtBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";

export type ActivityRow = {
  id: string;
  tool: string;
  title: string;
  status: "draft" | "published";
  /** NULL on a draft that hasn't been given points yet. */
  points: number | null;
  /** NULL: no due date. */
  dueAt: Date | null;
  /** Students who have finished their attempt. */
  submitted: number;
  /** 0 until the grader writes results (T22). */
  graded: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A course's activities for one of its teachers: soonest due first, then
 * those with no due date, newest first.
 */
export async function listCourseActivities(db: Db, actor: Actor, courseId: string): Promise<ActivityRow[]> {
  if (!UUID.test(courseId)) return [];
  const where = and({ text: "a.course_id = $1", values: [courseId] }, coursesTaughtBy(actor, "c"));
  return db.query<ActivityRow>(
    `select a.id, a.tool, a.title, a.status, a.points::float8 as points, a.due_at as "dueAt",
            (select count(*)::int from attempts t where t.activity_id = a.id and t.status = 'completed') as submitted,
            0 as graded
       from activities a
       join courses c on c.id = a.course_id
      where ${where.text}
      order by a.due_at asc nulls last, a.created_at desc`,
    where.values,
  );
}
