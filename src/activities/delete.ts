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

/** What deleting an activity touches, as its delete dialog says it (feedback 3f6eb879, 3b4df425). */
export type DeleteImpact = {
  /** In Canvas Assignments (a Canvas link, or an assignment DALAA made). */
  assigned: boolean;
  /** Students who opened it, finished or not. */
  started: number;
  /** Of those, how many finished. */
  submitted: number;
};

/** How many students started and finished it, for its delete dialog. */
export async function deleteImpact(db: Db, activityId: string): Promise<Pick<DeleteImpact, "started" | "submitted">> {
  const [row] = await db.query<{ started: number; submitted: number }>(
    `select count(*)::int as started, count(*) filter (where status = 'completed')::int as submitted
       from attempts where activity_id = $1`,
    [activityId],
  );
  return row;
}

/**
 * The delete dialog's sentences, and the box to tick once students have
 * started. Says what happens in Canvas (nothing: DALAA never deletes there),
 * to the students' work, and to the materials.
 */
export function deleteFacts({ assigned, started, submitted }: DeleteImpact): { facts: string[]; mustTick?: string } {
  const students = (n: number) => `${n} ${n === 1 ? "student" : "students"}`;
  const work =
    started === 0
      ? "No students have started it."
      : `${students(started)} started it${submitted > 0 ? `, and ${submitted === started ? (started === 1 ? "finished" : "all finished") : `${submitted} finished`}` : ""}. Their chats and grades in DALAA are deleted with it.`;
  const canvas = assigned
    ? "It's in Canvas Assignments. DALAA doesn't delete the Canvas assignment: delete it in Canvas too, or students who open it will get an error. Grades already sent to Canvas stay there."
    : "It isn't in Canvas, so nothing changes there.";
  return {
    facts: ["It's deleted for good.", work, canvas, "Its materials stay in Materials."],
    mustTick: started > 0 ? `Also delete ${started} ${started === 1 ? "student's" : "students'"} chats and grades. This can't be undone.` : undefined,
  };
}
