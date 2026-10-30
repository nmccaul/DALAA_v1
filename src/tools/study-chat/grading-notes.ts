/**
 * What Study Chat adds to the teacher's Grading tab (T42d): a class view of
 * the touchpoints covered and positions taken, and each student's own, from
 * what the live check tracked (progress.ts). The grader's result is separate;
 * this is what happened during the chats.
 */

import type { Db } from "@/db/types";
import type { GradingNotes } from "@/tools/screens";
import { STUDY_CHAT } from "./create";
import { classProgress, type AttemptProgress, type ClassProgress } from "./progress";
import { StudyChatSettings } from "./schema";

const students = (n: number) => (n === 1 ? "1 student" : `${n} students`);

/** One student's lines, each naming what it counts. Exported for tests. */
export function attemptLines(progress: AttemptProgress, positions: boolean): string[] {
  const lines: string[] = [];
  if (progress.total > 0) {
    const covered = progress.touchpoints.map((t) => t.label).join(", ");
    lines.push(`Points covered — ${progress.touchpoints.length} of ${progress.total}${covered ? `: ${covered}` : ""}`);
  }
  if (positions) lines.push(`Position: ${progress.position?.label ?? "none yet"}`);
  return lines;
}

/** The notes for the page, from a class's tracked progress. Exported for tests. */
export function notesFrom(progress: ClassProgress): GradingNotes | null {
  if (progress.touchpoints.length === 0 && progress.positions.length === 0) return null;
  const of = (n: number) => `${n} of ${students(progress.started)}`;
  const summary: GradingNotes["summary"] = [];
  if (progress.started > 0 && progress.touchpoints.length > 0) {
    summary.push({ heading: "Points covered", lines: progress.touchpoints.map((t) => `${t.label}: ${of(t.students)}`) });
  }
  if (progress.started > 0 && progress.positions.length > 0) {
    summary.push({ heading: "Positions taken", lines: progress.positions.map((p) => `${p.label}: ${of(p.students)}`) });
  }
  const byAttempt: GradingNotes["byAttempt"] = {};
  for (const [id, attempt] of progress.byAttempt) byAttempt[id] = attemptLines(attempt, progress.positions.length > 0);
  return { summary, byAttempt };
}

export async function studyChatGradingNotes(db: Db, activityId: string, attemptIds: readonly string[]): Promise<GradingNotes | null> {
  const [activity] = await db.query<{ settings: unknown }>("select settings from activities where id = $1 and tool = $2", [
    activityId,
    STUDY_CHAT,
  ]);
  const parsed = StudyChatSettings.safeParse(activity?.settings);
  if (!parsed.success) return null;
  return notesFrom(await classProgress(db, activityId, parsed.data, attemptIds));
}
