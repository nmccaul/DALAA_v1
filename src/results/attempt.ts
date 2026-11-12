/**
 * One student's attempt as their teacher sees it, for every tool: who, which
 * activity, and how far it got. The tool draws the transcript
 * (src/tools/screens.ts); the result and dispute come from the shared stores.
 */

import type { EndedBy } from "@/attempts/store";
import { and, coursesTaughtBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";

export type TaughtAttempt = {
  id: string;
  activityId: string;
  courseId: string;
  tool: string;
  activityTitle: string;
  studentName: string;
  loginId: string;
  status: "in_progress" | "completed";
  endedBy: EndedBy | null;
  startedAt: Date;
  completedAt: Date | null;
  /** The settings the attempt ran under (D-031). */
  settings: Record<string, unknown>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An attempt in a course the actor teaches; NULL for anyone else's, or a made-up id. */
export async function getTaughtAttempt(db: Db, actor: Actor, attemptId: string): Promise<TaughtAttempt | null> {
  if (!UUID.test(attemptId)) return null;
  const where = and({ text: "t.id = $1", values: [attemptId] }, coursesTaughtBy(actor, "c"));
  const [row] = await db.query<TaughtAttempt>(
    `select t.id, a.id as "activityId", a.course_id as "courseId", a.tool, a.title as "activityTitle",
            u.display_name as "studentName", u.external_id as "loginId", t.status, t.ended_by as "endedBy",
            t.started_at as "startedAt", t.completed_at as "completedAt", coalesce(t.settings, a.settings) as settings
       from attempts t
       join activities a on a.id = t.activity_id
       join courses c on c.id = a.course_id
       join users u on u.id = t.user_id
      where ${where.text}`,
    where.values,
  );
  return row ?? null;
}
