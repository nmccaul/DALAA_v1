/**
 * Deleting a saved material from the Materials tab (D-041): a reading
 * (course_content, with its PDF) or an AI-only note (course_guides). One a
 * published activity uses stays, so students mid-activity never lose their
 * reading; the teacher takes it out of that activity first. Drafts that use
 * it just lose it. A Canvas Page or File stays in Canvas: only DALAA's saved
 * copy goes.
 */

import { getTaughtCourse } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";

export type DeleteMaterialResult = { ok: true } | { ok: false; reason: string };

const TABLES = {
  students: { table: "course_content", column: "content_id" },
  ai: { table: "course_guides", column: "guide_id" },
} as const;

export async function deleteMaterial(
  db: Db,
  actor: Actor,
  courseId: string,
  seenBy: keyof typeof TABLES,
  materialId: string,
): Promise<DeleteMaterialResult> {
  if (!(await getTaughtCourse(db, actor, courseId))) return { ok: false, reason: "That course isn't one of yours." };
  if (!/^[0-9a-f-]{36}$/i.test(materialId)) return { ok: false, reason: "That material is already deleted." };
  const { table, column } = TABLES[seenBy];
  return db.transaction(async (tx) => {
    const [found] = await tx.query<{ id: string }>(`select id from ${table} where id = $1 and course_id = $2 for update`, [
      materialId,
      courseId,
    ]);
    // Already gone (a second click): the teacher got what they asked for.
    if (!found) return { ok: true };
    const published = await tx.query<{ title: string }>(
      `select distinct a.title from activity_materials m join activities a on a.id = m.activity_id
        where m.${column} = $1 and a.status = 'published' order by a.title`,
      [materialId],
    );
    if (published.length > 0) {
      const one = published.length === 1;
      const titles = published.map((a) => `"${a.title}"`).join(", ");
      return { ok: false, reason: `It's in ${titles}, which students can already open. Take it out of ${one ? "that activity" : "those activities"} first.` };
    }
    await tx.query(`delete from activity_materials where ${column} = $1`, [materialId]);
    // activities.content_id / guide_id are retired (activity_materials replaced them) but still point here on old rows.
    await tx.query(`update activities set ${column} = null where ${column} = $1`, [materialId]);
    await tx.query(`delete from ${table} where id = $1`, [materialId]);
    return { ok: true };
  });
}
