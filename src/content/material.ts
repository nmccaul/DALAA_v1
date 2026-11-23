/**
 * One saved material, for a teacher of its course: read it the way students
 * do and edit its name and text (feedback 8697eb90, D-043). A reading
 * (course_content) or an AI-only note (course_guides), found by id in either.
 * A PDF reading keeps its pages as uploaded: its text, which the AI reads and
 * "Show as text" shows, is what gets edited.
 */

import { getTaughtCourse, notTeachingReason } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { MAX_CHARS } from "./read";
import type { MaterialSource } from "./material-sources";

export const NAME_MAX = 200;

export type MaterialPage = {
  id: string;
  seenBy: "students" | "ai";
  name: string;
  body: string;
  source: MaterialSource;
  url: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  /** A reading whose PDF is kept, so it shows as pages. */
  hasFile: boolean;
  usedIn: { id: string; title: string; published: boolean }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TABLE = { students: { table: "course_content", column: "content_id" }, ai: { table: "course_guides", column: "guide_id" } } as const;

/** The material, or NULL for one that isn't there or a course the actor doesn't teach. */
export async function getMaterial(db: Db, actor: Actor, courseId: string, id: string): Promise<MaterialPage | null> {
  if (!UUID.test(id) || !(await getTaughtCourse(db, actor, courseId))) return null;
  for (const seenBy of ["students", "ai"] as const) {
    const { table, column } = TABLE[seenBy];
    const [row] = await db.query<MaterialPage>(
      `select m.id, '${seenBy}' as "seenBy", m.name, m.body, m.source, m.source_url as url,
              m.created_at as "createdAt", m.updated_at as "updatedAt",
              ${seenBy === "students" ? "exists (select 1 from content_files f where f.content_id = m.id)" : "false"} as "hasFile",
              coalesce((select json_agg(json_build_object('id', a.id, 'title', a.title, 'published', a.status = 'published') order by a.title)
                          from activities a
                         where exists (select 1 from activity_materials am where am.activity_id = a.id and am.${column} = m.id)), '[]') as "usedIn"
         from ${table} m
        where m.id = $1 and m.course_id = $2`,
      [id, courseId],
    );
    if (row) return row;
  }
  return null;
}

export type EditResult = { ok: true } | { ok: false; reason: string };

/** Saves a new name and text. Both are required; the text keeps the upload limit. */
export async function updateMaterial(
  db: Db,
  actor: Actor,
  courseId: string,
  id: string,
  edit: { name: string; body: string },
): Promise<EditResult> {
  if (!(await getTaughtCourse(db, actor, courseId))) return { ok: false, reason: notTeachingReason(actor) };
  const material = await getMaterial(db, actor, courseId, id);
  if (!material) return { ok: false, reason: "That material is gone. It may have been deleted." };
  const name = edit.name.trim();
  const body = edit.body.replace(/\r\n/g, "\n").trim();
  if (!name) return { ok: false, reason: "Give it a name." };
  if (name.length > NAME_MAX) return { ok: false, reason: `Keep the name under ${NAME_MAX} characters.` };
  if (!body) return { ok: false, reason: "The text can't be empty. To remove the material, delete it from Materials." };
  if (body.length > MAX_CHARS) {
    return { ok: false, reason: `That's ${body.length.toLocaleString("en-US")} characters; the limit is ${MAX_CHARS.toLocaleString("en-US")} (about 40 pages).` };
  }
  await db.query(`update ${TABLE[material.seenBy].table} set name = $2, body = $3, updated_at = now() where id = $1`, [id, name, body]);
  return { ok: true };
}
