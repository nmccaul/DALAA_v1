/**
 * Students' attempts at activities, for every tool (db/migrations/*_attempts.sql).
 * Only an active student of the course opens a published activity here; the
 * chassis hands the tool its settings and content and never reads them.
 *
 * Settings come back to server code only: a page must pass a student no more
 * than the tool's own student view of them (CLAUDE.md: hidden material is
 * never sent to the student's browser).
 *
 * An attempt keeps the settings it started under (D-031): once a student has
 * an attempt, they and its grader read that copy, never the teacher's later
 * edits. An attempt from before copies were kept (`settings` NULL) reads the
 * activity's current settings.
 */

import { canvasBaseUrl } from "@/canvas/institution";
import { and, coursesTakenBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";

export type EndedBy = "turns" | "time" | "question" | "student";

export type Attempt = {
  id: string;
  activityId: string;
  status: "in_progress" | "completed";
  /** NULL while in progress. */
  endedBy: EndedBy | null;
  startedAt: Date;
  /** NULL while in progress. */
  completedAt: Date | null;
};

export type TakenActivity = {
  id: string;
  courseId: string;
  tool: string;
  title: string;
  /** The student's attempt's copy once they've started (D-031); the activity's current settings before that. */
  settings: Record<string, unknown>;
  /** What the student studies; NULL when the activity has none. */
  content: { name: string; body: string } | null;
  /** The course's page in real Canvas, for the student's way back; NULL for a practice or unlinked course. */
  canvasCourseUrl: string | null;
};

/** Where a student takes an activity (src/app/activities/[activityId]). */
export const takePath = (activityId: string) => `/activities/${activityId}`;

/** The student home (src/app/page.tsx), showing one course's assignments. */
export const studentHomePath = (courseId: string) => `/?course=${courseId}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ATTEMPT_COLUMNS = `id, activity_id as "activityId", status, ended_by as "endedBy",
  started_at as "startedAt", completed_at as "completedAt"`;

/** A published activity, for an active student of its course; null for anyone else, a draft, or a made-up id. */
export async function getTakenActivity(db: Db, actor: Actor, activityId: string): Promise<TakenActivity | null> {
  if (!UUID.test(activityId)) return null;
  const where = and({ text: "a.id = $1 and a.status = 'published'", values: [activityId] }, coursesTakenBy(actor, "c"));
  const [row] = await db.query<
    Omit<TakenActivity, "content" | "canvasCourseUrl"> & {
      contentName: string | null;
      contentBody: string | null;
      canvasCourseId: string | null;
    }
  >(
    `select a.id, a.course_id as "courseId", a.tool, a.title, coalesce(t.settings, a.settings) as settings,
            cc.name as "contentName", cc.body as "contentBody",
            case when c.is_practice then null else c.canvas_course_id end as "canvasCourseId"
       from activities a
       join courses c on c.id = a.course_id
       left join course_content cc on cc.id = a.content_id
       left join attempts t on t.activity_id = a.id and t.user_id = $${where.values.length + 1}
      where ${where.text}`,
    [...where.values, actor.userId],
  );
  if (!row) return null;
  const { contentName, contentBody, canvasCourseId, ...activity } = row;
  return {
    ...activity,
    content: contentName !== null && contentBody !== null ? { name: contentName, body: contentBody } : null,
    canvasCourseUrl: canvasCourseId === null ? null : `${canvasBaseUrl()}/courses/${encodeURIComponent(canvasCourseId)}`,
  };
}

/**
 * The student's attempt at an activity they can take, started now if they
 * haven't one, with a copy of the activity's settings as they are now.
 * Starting twice returns the first, and keeps its copy.
 */
export async function startAttempt(db: Db, actor: Actor, activityId: string): Promise<Attempt | null> {
  if (!(await getTakenActivity(db, actor, activityId))) return null;
  await db.query(
    `insert into attempts (activity_id, user_id, settings)
     select id, $2, settings from activities where id = $1
     on conflict (activity_id, user_id) do nothing`,
    [activityId, actor.userId],
  );
  return getAttempt(db, actor, activityId);
}

/** The student's attempt at an activity, if they've started one. */
export async function getAttempt(db: Db, actor: Actor, activityId: string): Promise<Attempt | null> {
  if (!UUID.test(activityId)) return null;
  const [row] = await db.query<Attempt>(
    `select ${ATTEMPT_COLUMNS} from attempts where activity_id = $1 and user_id = $2`,
    [activityId, actor.userId],
  );
  return row ?? null;
}

/**
 * Ends an attempt that's still in progress and returns it. Ending it again
 * changes nothing: the first reason and time stand.
 */
export async function completeAttempt(db: Db, attemptId: string, endedBy: EndedBy): Promise<Attempt> {
  await db.query(
    "update attempts set status = 'completed', ended_by = $2, completed_at = now() where id = $1 and status = 'in_progress'",
    [attemptId, endedBy],
  );
  const [row] = await db.query<Attempt>(`select ${ATTEMPT_COLUMNS} from attempts where id = $1`, [attemptId]);
  return row;
}

/** A finished attempt with what its grader needs: whose it is and the settings it ran under. Server-only callers. */
export type FinishedAttempt = {
  attempt: Attempt;
  userId: string;
  activity: { id: string; courseId: string; tool: string; settings: Record<string, unknown> };
};

/** A completed attempt for its grader; null while it's in progress or for a made-up id. */
export async function getFinishedAttempt(db: Db, attemptId: string): Promise<FinishedAttempt | null> {
  if (!UUID.test(attemptId)) return null;
  const [row] = await db.query<Attempt & { userId: string; courseId: string; tool: string; settings: Record<string, unknown> }>(
    `select t.id, t.activity_id as "activityId", t.status, t.ended_by as "endedBy", t.started_at as "startedAt",
            t.completed_at as "completedAt", t.user_id as "userId", a.course_id as "courseId", a.tool,
            coalesce(t.settings, a.settings) as settings
       from attempts t join activities a on a.id = t.activity_id
      where t.id = $1 and t.status = 'completed'`,
    [attemptId],
  );
  if (!row) return null;
  const { userId, courseId, tool, settings, ...attempt } = row;
  return { attempt, userId, activity: { id: attempt.activityId, courseId, tool, settings } };
}

/** How many students have started an activity, finished or not: the teacher's edits don't reach their attempts. */
export async function countStartedAttempts(db: Db, activityId: string): Promise<number> {
  if (!UUID.test(activityId)) return 0;
  const [{ count }] = await db.query<{ count: number }>("select count(*)::int as count from attempts where activity_id = $1", [
    activityId,
  ]);
  return count;
}
