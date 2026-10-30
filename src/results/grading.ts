/**
 * The teacher's Grading tab, for every tool: where each student stands on
 * each published assignment, and the teacher's own score for a graded one.
 * The grader's score is kept as it was; a teacher's score counts instead
 * (db/migrations/*_teacher_scores.sql). Nothing here reads a tool's settings.
 */

import type { AssignmentStatus } from "@/activities/queries";
import { and, coursesTaughtBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";

export type StudentGrade = {
  userId: string;
  name: string;
  loginId: string;
  /** No longer on the class list; listed only when they have an attempt. */
  flagged: boolean;
  /** Canvas's Student View test user: kept here, labelled, so grading can be tried with it. */
  studentView: boolean;
  status: AssignmentStatus;
  /** NULL until they've started. */
  attemptId: string | null;
  /** The grader's score, the teacher's, and what it's out of: all NULL until graded; the teacher's NULL until they change it. */
  aiScore: number | null;
  teacherScore: number | null;
  maxScore: number | null;
  /** The student's open dispute of this grade (src/results/disputes.ts): NULL when there's none. */
  disputeId: string | null;
  disputeReason: string | null;
};

export type AssignmentGrades = {
  activityId: string;
  /** Which tool it is, so the page can show what that tool adds (src/tools/screens.ts). */
  tool: string;
  title: string;
  points: number;
  students: StudentGrade[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Each published assignment in a course the actor teaches (soonest due
 * first), with every student on the class list and anyone flagged off it who
 * has an attempt, by name; Canvas's Student View users last.
 */
export async function listCourseGrades(db: Db, actor: Actor, courseId: string): Promise<AssignmentGrades[]> {
  if (!UUID.test(courseId)) return [];
  const where = and({ text: "a.course_id = $1 and a.status = 'published'", values: [courseId] }, coursesTaughtBy(actor, "c"));
  const rows = await db.query<Omit<AssignmentGrades, "students"> & StudentGrade>(
    `select a.id as "activityId", a.tool, a.title, a.points::float8 as points,
            u.id as "userId", u.display_name as name, u.external_id as "loginId", m.status = 'flagged' as flagged,
            m.student_view is true as "studentView",
            case when r.status = 'graded' then 'graded'
                 when t.status = 'completed' then 'submitted'
                 when t.id is not null then 'in_progress'
                 else 'not_started' end as status,
            t.id as "attemptId",
            case when r.status = 'graded' then r.score::float8 end as "aiScore",
            r.teacher_score::float8 as "teacherScore",
            case when r.status = 'graded' then r.max_score::float8 end as "maxScore",
            d.id as "disputeId", d.reason as "disputeReason"
       from activities a
       join courses c on c.id = a.course_id
       join course_members m on m.course_id = a.course_id and m.role = 'student'
       join users u on u.id = m.user_id
       left join attempts t on t.activity_id = a.id and t.user_id = m.user_id
       left join results r on r.attempt_id = t.id
       left join disputes d on d.attempt_id = t.id and d.status = 'open'
      where ${where.text} and (m.status = 'active' or t.id is not null)
      order by a.due_at asc nulls last, a.created_at desc, a.id, m.student_view is true, u.display_name, u.external_id`,
    where.values,
  );
  const byActivity = new Map<string, AssignmentGrades>();
  for (const { activityId, tool, title, points, ...student } of rows) {
    let assignment = byActivity.get(activityId);
    if (!assignment) byActivity.set(activityId, (assignment = { activityId, tool, title, points, students: [] }));
    assignment.students.push(student);
  }
  return [...byActivity.values()];
}

export type SetScoreResult = "saved" | "not_found" | "out_of_range";

/**
 * Sets the teacher's score for a graded attempt in a course the actor
 * teaches, or with `score` NULL puts the grader's score back. The grader's
 * score is never changed. "not_found" covers anyone else's course, an attempt
 * not graded yet, and a made-up id.
 */
export async function setTeacherScore(db: Db, actor: Actor, attemptId: string, score: number | null): Promise<SetScoreResult> {
  if (!UUID.test(attemptId)) return "not_found";
  const where = and({ text: "t.id = $1 and r.status = 'graded'", values: [attemptId] }, coursesTaughtBy(actor, "c"));
  const [graded] = await db.query<{ maxScore: number }>(
    `select r.max_score::float8 as "maxScore"
       from results r
       join attempts t on t.id = r.attempt_id
       join activities a on a.id = t.activity_id
       join courses c on c.id = a.course_id
      where ${where.text}`,
    where.values,
  );
  if (!graded) return "not_found";
  if (score !== null && !(Number.isFinite(score) && score >= 0 && score <= graded.maxScore)) return "out_of_range";
  await db.query(
    `update results
        set teacher_score = $2, teacher_scored_by = case when $2::numeric is null then null else $3::uuid end,
            teacher_scored_at = case when $2::numeric is null then null else now() end
      where attempt_id = $1 and status = 'graded'`,
    [attemptId, score === null ? null : Math.round(score * 100) / 100, actor.userId],
  );
  return "saved";
}
