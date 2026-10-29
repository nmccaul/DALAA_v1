/**
 * The student's own work: a paper, code or plan they add at the start of an
 * attempt whose activity asks for it (db/migrations/*_attempt_work.sql). One
 * per attempt, read with the same intake and limits as course content
 * (src/content/read.ts). The only code that touches `attempt_work`.
 *
 * Whether an activity asks for it is the tool's setting; the chassis only
 * keeps it with the attempt.
 */

import { cleanText, readContent } from "@/content/read";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { startAttempt } from "./store";

export type StudentWork = { name: string; body: string };

export type WorkInput = { kind: "paste"; name: string; text: string } | { kind: "file"; name: string; bytes: Uint8Array };

export type SaveWorkResult = { ok: true; work: StudentWork } | { ok: false; reason: string };

/**
 * Starts the student's attempt if they haven't one and keeps their work with
 * it. Work already saved stands: saving again (a retry, or a second upload)
 * returns the first, so the chat and the grade are about one piece of work.
 */
export async function saveStudentWork(db: Db, actor: Actor, activityId: string, input: WorkInput): Promise<SaveWorkResult> {
  if (input.kind === "paste" && !cleanText(input.text)) return { ok: false, reason: "Paste your work, or upload it as a file." };
  const read = await readContent(input);
  if (!read.ok) return read;

  const attempt = await startAttempt(db, actor, activityId);
  if (!attempt) return { ok: false, reason: "We couldn't find that assignment." };
  if (attempt.status === "completed") return { ok: false, reason: "This chat has ended." };

  await db.query(
    `insert into attempt_work (attempt_id, source, name, body) values ($1, $2, $3, $4)
     on conflict (attempt_id) do nothing`,
    [attempt.id, read.source, read.name, read.body],
  );
  const work = await getStudentWork(db, attempt.id);
  return { ok: true, work: work! };
}

/** The work kept with an attempt; null when the student hasn't added any. Callers check the attempt is one they may read. */
export async function getStudentWork(db: Db, attemptId: string): Promise<StudentWork | null> {
  const [row] = await db.query<StudentWork>("select name, body from attempt_work where attempt_id = $1", [attemptId]);
  return row ?? null;
}
