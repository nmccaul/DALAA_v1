/**
 * Activities across every tool (db/migrations/*_activities.sql), as the
 * chassis lists them. Nothing here reads a tool's settings.
 */

import { and, coursesTakenBy, coursesTaughtBy, type Actor } from "@/db/scope";
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
  /** Finished attempts with a grade saved. */
  graded: number;
  /** In the Canvas course: added from Canvas (a Canvas link) or assigned from DALAA (a Canvas assignment). */
  assigned: boolean;
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
            (select count(*)::int from attempts t join results r on r.attempt_id = t.id
              where t.activity_id = a.id and r.status = 'graded') as graded,
            (a.lti_resource_link_id is not null or a.canvas_assignment_id is not null) as assigned
       from activities a
       join courses c on c.id = a.course_id
      where ${where.text}
      order by a.due_at asc nulls last, a.created_at desc`,
    where.values,
  );
}

/** An activity in another course the teacher teaches, offered for copying. */
export type OtherCourseActivity = {
  id: string;
  tool: string;
  title: string;
  status: "draft" | "published";
  points: number | null;
  courseId: string;
  courseCode: string;
  courseTerm: string;
  updatedAt: Date;
};

/**
 * "From my other courses" on a course's Activities tab: every activity in the
 * other courses the actor teaches, drafts included, for copying into this
 * one. Newest course first, then last changed first within a course.
 */
export async function listOtherCourseActivities(db: Db, actor: Actor, courseId: string): Promise<OtherCourseActivity[]> {
  if (!UUID.test(courseId)) return [];
  const where = and({ text: "c.id <> $1", values: [courseId] }, coursesTaughtBy(actor, "c"));
  return db.query<OtherCourseActivity>(
    `select a.id, a.tool, a.title, a.status, a.points::float8 as points,
            c.id as "courseId", c.code as "courseCode", c.term as "courseTerm", a.updated_at as "updatedAt"
       from activities a
       join courses c on c.id = a.course_id
      where ${where.text}
      order by c.created_at desc, c.id, a.updated_at desc, a.created_at desc`,
    where.values,
  );
}

/**
 * Where a student stands on an assignment. "submitted" is finished but not
 * graded yet (being graded, or the grader failed and will try again).
 */
export type AssignmentStatus = "not_started" | "in_progress" | "submitted" | "graded";

export type StudentAssignment = {
  id: string;
  courseId: string;
  tool: string;
  title: string;
  points: number;
  /** NULL: no due date. */
  dueAt: Date | null;
  status: AssignmentStatus;
  /** The score that counts (the teacher's if they changed it) and what it was out of; NULL until graded, never 0 for "not graded yet". */
  score: number | null;
  maxScore: number | null;
};

/**
 * The student home list: published assignments in the courses the actor is
 * taking, with their own progress. Drafts are never listed. Soonest due
 * first, then those with no due date, newest first.
 */
export async function listStudentAssignments(db: Db, actor: Actor): Promise<StudentAssignment[]> {
  const where = and({ text: "a.status = 'published'", values: [] }, coursesTakenBy(actor, "c"));
  return db.query<StudentAssignment>(
    `select a.id, a.course_id as "courseId", a.tool, a.title, a.points::float8 as points, a.due_at as "dueAt",
            case when r.status = 'graded' then 'graded'
                 when t.status = 'completed' then 'submitted'
                 when t.id is not null then 'in_progress'
                 else 'not_started' end as status,
            case when r.status = 'graded' then coalesce(r.teacher_score, r.score)::float8 end as score,
            case when r.status = 'graded' then r.max_score::float8 end as "maxScore"
       from activities a
       join courses c on c.id = a.course_id
       left join attempts t on t.activity_id = a.id and t.user_id = $${where.values.length + 1}
       left join results r on r.attempt_id = t.id
      where ${where.text}
      order by a.due_at asc nulls last, a.created_at desc`,
    [...where.values, actor.userId],
  );
}
