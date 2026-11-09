/**
 * A course's Materials tab (D-032): everything saved to the course for
 * activities to use. What students study (course_content) and what only the
 * AI reads (course_guides), each with the activities that use it. Only the
 * course's teachers see it; bodies are never fetched here.
 */

import type { CanvasContentList } from "@/canvas/content";
import { getTaughtCourse } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";

export type Material = {
  id: string;
  name: string;
  source: "paste" | "upload" | "canvas-page" | "canvas-file" | "web";
  /** A web page's address; null for everything else. */
  url: string | null;
  /** "students": students and the AI read it; "ai": only the AI does. */
  seenBy: "students" | "ai";
  createdAt: Date;
  usedIn: { id: string; title: string }[];
};

/** Newest first; empty for a course the actor doesn't teach. */
export async function listCourseMaterials(db: Db, actor: Actor, courseId: string): Promise<Material[]> {
  if (!(await getTaughtCourse(db, actor, courseId))) return [];
  return db.query<Material>(
    `select m.id, m.name, m.source, m.source_url as url, m.seen_by as "seenBy", m.created_at as "createdAt",
            coalesce((select json_agg(json_build_object('id', a.id, 'title', a.title) order by a.title)
                        from activities a
                       where a.course_id = m.course_id
                         and (case m.seen_by when 'students' then a.content_id else a.guide_id end) = m.id), '[]') as "usedIn"
       from (select id, course_id, name, source, source_url, created_at, 'students' as seen_by from course_content
             union all
             select id, course_id, name, source, source_url, created_at, 'ai' from course_guides) m
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
  web: "Web page",
};

/** One row of the Materials tab: a saved material, or a Canvas Page or File ("canvas" until an activity uses it). */
export type MaterialRow = {
  key: string;
  name: string;
  source: Material["source"];
  seenBy: Material["seenBy"] | "canvas";
  usedIn: Material["usedIn"];
  date: Date;
  url: string | null;
};

/**
 * Saved materials plus every Page and readable File in the linked Canvas
 * course, listed live: nothing in Canvas has to be imported first. A Canvas
 * item an activity already uses shows once, with those activities.
 */
export function mergeMaterials(saved: Material[], canvas: CanvasContentList | null): MaterialRow[] {
  const rows: MaterialRow[] = [];
  const fromCanvas = new Map<string, MaterialRow>();
  if (canvas) {
    for (const p of canvas.pages) {
      const row: MaterialRow = { key: `page-${p.page_id}`, name: p.title, source: "canvas-page", seenBy: "canvas", usedIn: [], date: new Date(p.updated_at), url: null };
      fromCanvas.set(`canvas-page:${p.title}`, row);
      rows.push(row);
    }
    for (const f of canvas.files) {
      const row: MaterialRow = { key: `file-${f.id}`, name: f.display_name, source: "canvas-file", seenBy: "canvas", usedIn: [], date: new Date(f.updated_at), url: null };
      fromCanvas.set(`canvas-file:${f.display_name}`, row);
      fromCanvas.set(`canvas-file:${f.filename}`, row);
      rows.push(row);
    }
  }
  for (const m of saved) {
    const match = m.seenBy === "students" ? fromCanvas.get(`${m.source}:${m.name}`) : undefined;
    if (match) {
      match.seenBy = "students";
      match.usedIn = [...match.usedIn, ...m.usedIn.filter((a) => !match.usedIn.some((b) => b.id === a.id))];
    } else {
      rows.push({ key: `${m.seenBy}-${m.id}`, name: m.name, source: m.source, seenBy: m.seenBy, usedIn: m.usedIn, date: m.createdAt, url: m.url });
    }
  }
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime() || a.name.localeCompare(b.name));
}

