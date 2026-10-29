/**
 * Course content: what students study, saved once and picked by activities
 * (db/migrations/*_course_content.sql). Only a course's teachers save it.
 */

import { getTaughtCourse } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { readContent, type ContentInput } from "./read";

export type SavedContent = { id: string; source: string; name: string; body: string };

export type SaveResult = { ok: true; content: SavedContent } | { ok: false; reason: string };

/**
 * Reads the input and saves it to the course. `creationKey` is client-generated:
 * a retry with the same key returns the first save instead of a second copy.
 */
export async function saveContent(
  db: Db,
  actor: Actor,
  courseId: string,
  creationKey: string,
  input: ContentInput,
): Promise<SaveResult> {
  if (!(await getTaughtCourse(db, actor, courseId))) return { ok: false, reason: "That course isn't one you teach." };

  const read = await readContent(input);
  if (!read.ok) return read;

  const [inserted] = await db.query<SavedContent>(
    `insert into course_content (course_id, source, name, body, creation_key, created_by)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (creation_key) do nothing
     returning id, source, name, body`,
    [courseId, read.source, read.name, read.body, creationKey, actor.userId],
  );
  if (inserted) return { ok: true, content: inserted };

  const [existing] = await db.query<SavedContent & { course_id: string; created_by: string }>(
    "select id, source, name, body, course_id, created_by from course_content where creation_key = $1",
    [creationKey],
  );
  if (existing.created_by !== actor.userId || existing.course_id !== courseId) {
    throw new Error("Content key belongs to someone else");
  }
  return { ok: true, content: { id: existing.id, source: existing.source, name: existing.name, body: existing.body } };
}
