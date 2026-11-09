/**
 * The AI-only guide: a teaching note, answer key or argument framework that
 * the chat model and the grader read and students never do
 * (db/migrations/*_activity_guides.sql). The only code that reads
 * `course_guides`.
 *
 * Students' pages never call `activityGuides` (CLAUDE.md: hidden material is not
 * fetched for student requests). It's for server code that's about to call a
 * model, and what it returns goes into the prompt, never into a response.
 */

import { getTaughtCourse } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import type { ContentInput } from "./read";
import { copyTo, saveTo, type SaveResult } from "./store";

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

/**
 * Every AI-only note of an activity (db/migrations/*_activity_materials.sql),
 * in the teacher's order, for the model about to run or grade it, or for the
 * activity's teacher. Never for a student request.
 */
export async function activityGuides(db: Db, activityId: string): Promise<(Guide & { id: string })[]> {
  if (!UUID.test(activityId)) return [];
  return db.query<Guide & { id: string }>(
    `select g.id, g.name, g.body
       from activity_materials m join course_guides g on g.id = m.guide_id
      where m.activity_id = $1
      order by m.position`,
    [activityId],
  );
}

/** Which of these ids are guides of this course, each with its length in characters. */
export async function guidesInCourse(db: Db, courseId: string, guideIds: readonly string[]): Promise<Map<string, number>> {
  const ids = guideIds.filter((id) => UUID.test(id));
  if (ids.length === 0) return new Map();
  const rows = await db.query<{ id: string; chars: number }>(
    "select id, length(body)::int as chars from course_guides where course_id = $1 and id = any($2::uuid[])",
    [courseId, ids],
  );
  return new Map(rows.map((r) => [r.id, r.chars]));
}

/** Copies AI-only notes into another course the actor teaches (store.ts `copyTo`); null if any isn't theirs. */
export async function copyGuides(
  db: Db,
  actor: Actor,
  fromCourseId: string,
  toCourseId: string,
  guideIds: readonly string[],
): Promise<string[] | null> {
  return copyTo(db, "course_guides", actor, fromCourseId, toCourseId, guideIds);
}
