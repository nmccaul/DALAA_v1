/**
 * The AI-only guide: a teaching note, answer key or argument framework that
 * the chat model and the grader read and students never do
 * (db/migrations/*_activity_guides.sql). The only code that reads
 * `course_guides`.
 *
 * Students' pages never call `aiGuide` (CLAUDE.md: hidden material is not
 * fetched for student requests). It's for server code that's about to call a
 * model, and what it returns goes into the prompt, never into a response.
 */

import { getTaughtCourse } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import type { ContentInput } from "./read";
import { saveTo, type SaveResult } from "./store";

export type Guide = { name: string; body: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the input and saves it as a guide for the course; a retry with the same key returns the first save. */
export async function saveGuide(
  db: Db,
  actor: Actor,
  courseId: string,
  creationKey: string,
  input: ContentInput,
): Promise<SaveResult> {
  return saveTo(db, "course_guides", actor, courseId, creationKey, input);
}

/** A course's guide, for its teachers; null for anyone else or a made-up id. */
export async function getTaughtGuide(
  db: Db,
  actor: Actor,
  courseId: string,
  guideId: string,
): Promise<(Guide & { id: string }) | null> {
  if (!UUID.test(guideId) || !(await getTaughtCourse(db, actor, courseId))) return null;
  const [row] = await db.query<Guide & { id: string }>(
    "select id, name, body from course_guides where id = $1 and course_id = $2",
    [guideId, courseId],
  );
  return row ?? null;
}

/** The guide of an activity, for the model about to run or grade it; null when it has none. */
export async function aiGuide(db: Db, activityId: string): Promise<Guide | null> {
  if (!UUID.test(activityId)) return null;
  const [row] = await db.query<Guide>(
    "select g.name, g.body from activities a join course_guides g on g.id = a.guide_id where a.id = $1",
    [activityId],
  );
  return row ?? null;
}
