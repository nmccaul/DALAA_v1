/**
 * The PDF a reading was made from (db/migrations/*_content_files.sql), so a
 * student reads its pages as the teacher made them, not only its text. The
 * only code that reads or writes `content_files`. Kept in Postgres for now:
 * at most 4 MB each, a few readings a course. The text in course_content
 * stays what the AI reads, and what students get when the file can't show.
 */

import type { Db } from "@/db/types";

export const PDF = "application/pdf";

/** Keeps a reading's PDF. A failure only costs the page view, so it's logged, not thrown. */
export async function saveFile(db: Db, contentId: string, bytes: Uint8Array): Promise<void> {
  try {
    await db.query(
      "insert into content_files (content_id, media_type, bytes) values ($1, $2, $3) on conflict (content_id) do nothing",
      [contentId, PDF, Buffer.from(bytes)],
    );
  } catch (error) {
    console.error("couldn't keep the reading's file:", error instanceof Error ? error.message : error);
  }
}

/** Gives a copied reading its original's file, when it has one. */
export async function copyFiles(db: Db, fromId: string, toId: string): Promise<void> {
  await db.query(
    `insert into content_files (content_id, media_type, bytes)
     select $2, media_type, bytes from content_files where content_id = $1
     on conflict (content_id) do nothing`,
    [fromId, toId],
  );
}

/** A reading's PDF; null when it has none. Callers check who may see it first. */
export async function readFile(db: Db, contentId: string): Promise<Uint8Array | null> {
  const [row] = await db.query<{ bytes: Buffer }>("select bytes from content_files where content_id = $1", [contentId]);
  return row ? new Uint8Array(row.bytes) : null;
}

/** Where a page fetches a reading's PDF (src/app/api/activities/[activityId]/readings/[contentId]). */
export const readingFilePath = (activityId: string, contentId: string) => `/api/activities/${activityId}/readings/${contentId}`;
