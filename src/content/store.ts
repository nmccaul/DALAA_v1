/**
 * Course content: what students study, saved once and picked by activities
 * (db/migrations/*_course_content.sql). Only a course's teachers save it.
 */

import { getTaughtCourse, notTeachingReason } from "@/courses/queries";
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
  return saveTo(db, "course_content", actor, courseId, creationKey, input);
}

/**
 * Saves to `course_content` (students read it) or `course_guides` (they never
 * do, src/content/guide.ts). The two tables have the same shape.
 */
export async function saveTo(
  db: Db,
  table: "course_content" | "course_guides",
  actor: Actor,
  courseId: string,
  creationKey: string,
  input: ContentInput,
): Promise<SaveResult> {
  if (!(await getTaughtCourse(db, actor, courseId))) return { ok: false, reason: notTeachingReason(actor) };

  const read = await readContent(input);
  if (!read.ok) return read;

  const [inserted] = await db.query<SavedContent>(
    `insert into ${table} (course_id, source, name, body, creation_key, created_by, source_url)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (creation_key) do nothing
     returning id, source, name, body`,
    [courseId, read.source, read.name, read.body, creationKey, actor.userId, read.url ?? null],
  );
  if (inserted) return { ok: true, content: inserted };

  const [existing] = await db.query<SavedContent & { course_id: string; created_by: string }>(
    `select id, source, name, body, course_id, created_by from ${table} where creation_key = $1`,
    [creationKey],
  );
  if (existing.created_by !== actor.userId || existing.course_id !== courseId) {
    throw new Error("Content key belongs to someone else");
  }
  return { ok: true, content: { id: existing.id, source: existing.source, name: existing.name, body: existing.body } };
}

/** One piece of a course's content, for the course's teachers; null if it isn't theirs. */
export async function getContent(db: Db, actor: Actor, courseId: string, contentId: string): Promise<SavedContent | null> {
  if (!(await getTaughtCourse(db, actor, courseId))) return null;
  if (!/^[0-9a-f-]{36}$/i.test(contentId)) return null;
  const [row] = await db.query<SavedContent>(
    "select id, source, name, body from course_content where id = $1 and course_id = $2",
    [contentId, courseId],
  );
  return row ?? null;
}

/**
 * Copies materials of one course into another for the teacher of both, in the
 * order given, and returns the new ids in that order. A material the target
 * course already has word for word (same source, name and text) is reused
 * instead of copied again. Null when the actor doesn't teach both courses or
 * an id isn't a material of the source course.
 */
export async function copyTo(
  db: Db,
  table: "course_content" | "course_guides",
  actor: Actor,
  fromCourseId: string,
  toCourseId: string,
  ids: readonly string[],
): Promise<string[] | null> {
  if (!(await getTaughtCourse(db, actor, fromCourseId)) || !(await getTaughtCourse(db, actor, toCourseId))) return null;
  if (ids.length === 0) return [];
  if (fromCourseId === toCourseId) return [...ids];

  const copied: string[] = [];
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [found] = await db.query<{ id: string }>(
      `select t.id
         from ${table} s
         left join ${table} t on t.course_id = $3 and t.source = s.source and t.name = s.name and t.body = s.body
        where s.id = $1 and s.course_id = $2
        order by t.created_at nulls last
        limit 1`,
      [id, fromCourseId, toCourseId],
    );
    if (!found) return null;
    if (found.id) {
      copied.push(found.id);
      continue;
    }
    const [inserted] = await db.query<{ id: string }>(
      `insert into ${table} (course_id, source, name, body, creation_key, created_by, source_url)
       select $3, source, name, body, gen_random_uuid(), $4, source_url from ${table} where id = $1 and course_id = $2
       returning id`,
      [id, fromCourseId, toCourseId, actor.userId],
    );
    copied.push(inserted.id);
  }
  return copied;
}

/** Copies readings into another course the actor teaches (`copyTo`); null if any isn't theirs. */
export async function copyContent(
  db: Db,
  actor: Actor,
  fromCourseId: string,
  toCourseId: string,
  contentIds: readonly string[],
): Promise<string[] | null> {
  return copyTo(db, "course_content", actor, fromCourseId, toCourseId, contentIds);
}
