/**
 * A course's Materials tab (D-032): everything saved to the course for
 * activities to use. What students study (course_content) and what only the
 * AI reads (course_guides), each with the activities that use it. Only the
 * course's teachers see it; bodies are never fetched here.
 */

import { getTaughtCourse } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";

export type Material = {
  id: string;
  name: string;
  source: "paste" | "upload" | "canvas-page" | "canvas-file";
  /** "students": students and the AI read it; "ai": only the AI does. */
  seenBy: "students" | "ai";
  createdAt: Date;
  usedIn: { id: string; title: string }[];
};

/** Newest first; empty for a course the actor doesn't teach. */
export async function listCourseMaterials(db: Db, actor: Actor, courseId: string): Promise<Material[]> {
  if (!(await getTaughtCourse(db, actor, courseId))) return [];
  return db.query<Material>(
    `select m.id, m.name, m.source, m.seen_by as "seenBy", m.created_at as "createdAt",
            coalesce((select json_agg(json_build_object('id', a.id, 'title', a.title) order by a.title)
                        from activities a
                       where a.course_id = m.course_id
                         and (case m.seen_by when 'students' then a.content_id else a.guide_id end) = m.id), '[]') as "usedIn"
       from (select id, course_id, name, source, created_at, 'students' as seen_by from course_content
             union all
             select id, course_id, name, source, created_at, 'ai' from course_guides) m
      where m.course_id = $1
      order by m.created_at desc, m.name`,
    [courseId],
  );
}

/** What each source is called on the Materials tab. */
export const SOURCE_LABEL: Record<Material["source"], string> = {
  paste: "Pasted",
  upload: "Uploaded",
  "canvas-page": "Canvas Page",
  "canvas-file": "Canvas File",
};
