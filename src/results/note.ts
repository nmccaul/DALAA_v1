/**
 * "Polish with AI" for the reason a teacher changed a grade (feedback
 * ae234e89): the teacher writes what they mean, and the AI says it more
 * clearly and kindly for the student, without adding anything. The teacher
 * sees the result in the box and keeps, edits or drops it; nothing is saved
 * here.
 */

import type { LanguageModel } from "ai";
import { generateReply } from "@/ai/call";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { getTaughtAttempt } from "./attempt";
import { NOTE_MAX } from "./grading";

export const POLISH_SYSTEM = `You tidy a teacher's note to a student about why the teacher changed their grade.
An AI graded the chat first; then the teacher changed the score. In the note, "the AI", "ai" or "the grader" means that first AI grading, never the student.
Keep the teacher's meaning exactly: who did what, what was missed and by whom, and whether the grade went up or down. Fix spelling and shorthand ("u" = you, "r" = are).
Add no new claims, praise or criticism. Write to the student ("you"), plainly and kindly, in one to three short sentences.
No greeting, no sign-off, no quotation marks. Reply with the note only.

Example. Score went up from 4 to 5. Teacher's note: "u explained stripes ok but ai missed u said the stars r states"
Good: "You explained the stripes well, and you did say the stars stand for the states. The first grading missed that, so I raised your score."
Wrong (reverses the meaning): "You did not say that the stars stand for the states."`;

export async function polishNote(
  db: Db,
  model: LanguageModel,
  actor: Actor,
  attemptId: string,
  text: string,
  /** The AI's score and the one the teacher is setting, so the note's direction is known. */
  scores: { ai: number | null; teacher: number | null; max: number | null } = { ai: null, teacher: null, max: null },
): Promise<{ text?: string; error?: string }> {
  const draft = text.trim();
  if (!draft) return { error: "Write what you mean first; the AI tidies it." };
  if (draft.length > NOTE_MAX) return { error: `Keep it under ${NOTE_MAX.toLocaleString("en-US")} characters.` };
  const attempt = await getTaughtAttempt(db, actor, attemptId);
  if (!attempt) return { error: "That student's chat isn't one of yours." };
  try {
    const polished = await generateReply(
      db,
      model,
      { purpose: "grade.note", userId: actor.userId, courseId: attempt.courseId },
      { system: POLISH_SYSTEM, prompt: `Activity: ${attempt.activityTitle}\n${direction(scores)}\n\nThe teacher's note:\n${draft}` },
    );
    const out = polished.trim().replace(/^["“]|["”]$/g, "").slice(0, NOTE_MAX);
    return out ? { text: out } : { error: "The AI didn't answer. Try again, or keep your own words." };
  } catch {
    return { error: "The AI didn't answer. Try again, or keep your own words." };
  }
}

/** "Score went up from 4 to 5 (out of 10).", or nothing useful when the scores aren't known. */
export function direction({ ai, teacher, max }: { ai: number | null; teacher: number | null; max: number | null }): string {
  if (ai === null || teacher === null || !Number.isFinite(teacher)) return "The new score isn't given.";
  const out = max === null ? "" : ` (out of ${max})`;
  if (teacher === ai) return `The score stays at ${ai}${out}.`;
  return `Score went ${teacher > ai ? "up" : "down"} from ${ai} to ${teacher}${out}.`;
}
