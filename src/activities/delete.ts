/**
 * Deleting an activity (D-041). Everything students did in it goes with it —
 * attempts, chats, grades, disputes, records of grades sent, the class brief —
 * which the schema cascades. Once a student has started it, the teacher has
 * to say so (`withStudentWork`), or nothing is deleted. DALAA never changes
 * Canvas here: a Canvas assignment or link for it stays until the teacher
 * removes it there, and grades already sent stay in the gradebook.
 */

import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { getTaughtActivity } from "./store";

export type DeleteActivityResult = { ok: true; courseId: string } | { ok: false; reason: string };

export async function deleteActivity(
  db: Db,
  actor: Actor,
  activityId: string,
  withStudentWork: boolean,
): Promise<DeleteActivityResult> {
  const activity = await getTaughtActivity(db, actor, activityId);
  if (!activity) return { ok: false, reason: "That activity is already deleted, or isn't one of yours." };
  return db.transaction(async (tx) => {
    // The row lock waits out a student starting it right now, so the count below is the real one.
    await tx.query("select id from activities where id = $1 for update", [activity.id]);
    const [{ started }] = await tx.query<{ started: number }>(
      "select count(*)::int as started from attempts where activity_id = $1",
      [activity.id],
    );
    if (started > 0 && !withStudentWork) {
      return { ok: false, reason: `${started} ${started === 1 ? "student has" : "students have"} started it. Tick the box to delete their work too.` };
    }
    await tx.query("delete from activities where id = $1", [activity.id]);
    return { ok: true, courseId: activity.courseId };
  });
}
