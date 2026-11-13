/**
 * A course's Materials tab (D-032): everything saved to the course for
 * activities to use. What students study (course_content) and what only the
 * AI reads (course_guides), each with the activities that use it. Only the
 * course's teachers see it; bodies are never fetched here.
 */

import { clientFor } from "@/canvas/connection";
import { listCourseCanvasContent, type CanvasContentList, type CanvasPick, type CourseContentProblem } from "@/canvas/content";
import { VaultError } from "@/canvas/vault";
import { getTaughtCourse } from "@/courses/queries";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import type { MaterialSource } from "./material-sources";

export type Material = {
  id: string;
  name: string;
  source: MaterialSource;
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
                         and exists (select 1 from activity_materials am
                                      where am.activity_id = a.id
                                        and (case m.seen_by when 'students' then am.content_id else am.guide_id end) = m.id)), '[]') as "usedIn"
       from (select id, course_id, name, source, source_url, created_at, 'students' as seen_by from course_content
             union all
             select id, course_id, name, source, source_url, created_at, 'ai' from course_guides) m
      where m.course_id = $1
      order by m.created_at desc, m.name`,
    [courseId],
  );
}

export { SOURCE_LABEL } from "./material-sources";

/** One row of the Materials tab: a saved material, or a Canvas Page or File ("canvas" until an activity uses it). */
export type MaterialRow = {
  key: string;
  name: string;
  source: Material["source"];
  seenBy: Material["seenBy"] | "canvas";
  usedIn: Material["usedIn"];
  date: Date;
  url: string | null;
  /** The saved material's id (with `seenBy`, which table); null for a Canvas item nothing has saved yet. */
  savedId: string | null;
  /** The Canvas Page or File this row lists; null for a material that isn't from the linked Canvas course. */
  canvas: CanvasPick | null;
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
      const row: MaterialRow = { key: `page-${p.page_id}`, name: p.title, source: "canvas-page", seenBy: "canvas", usedIn: [], date: new Date(p.updated_at), url: null, savedId: null, canvas: { kind: "page", url: p.url } };
      fromCanvas.set(`canvas-page:${p.title}`, row);
      rows.push(row);
    }
    for (const f of canvas.files) {
      const row: MaterialRow = { key: `file-${f.id}`, name: f.display_name, source: "canvas-file", seenBy: "canvas", usedIn: [], date: new Date(f.updated_at), url: null, savedId: null, canvas: { kind: "file", id: f.id } };
      fromCanvas.set(`canvas-file:${f.display_name}`, row);
      fromCanvas.set(`canvas-file:${f.filename}`, row);
      rows.push(row);
    }
  }
  for (const m of saved) {
    const match = m.seenBy === "students" ? fromCanvas.get(`${m.source}:${m.name}`) : undefined;
    if (match) {
      match.seenBy = "students";
      match.savedId ??= m.id;
      match.usedIn = [...match.usedIn, ...m.usedIn.filter((a) => !match.usedIn.some((b) => b.id === a.id))];
    } else {
      rows.push({ key: `${m.seenBy}-${m.id}`, name: m.name, source: m.source, seenBy: m.seenBy, usedIn: m.usedIn, date: m.createdAt, url: m.url, savedId: m.id, canvas: null });
    }
  }
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime() || a.name.localeCompare(b.name));
}


/** Why the Canvas course's Pages and Files aren't listed, in a sentence. */
export const CANVAS_PROBLEM: Record<CourseContentProblem, string> = {
  "not-yours": "Canvas doesn't list you as a teacher of this course, so its Pages and Files aren't shown.",
  "not-linked": "This course isn't connected to Canvas, so its Pages and Files aren't shown.",
  "wrong-canvas": "This course is in the other Canvas (practice or real). Switch in Settings to see its Pages and Files.",
  reconnect: "Canvas didn't accept your connection. Reconnect Canvas to see this course's Pages and Files.",
  unavailable: "We couldn't reach Canvas just now, so its Pages and Files aren't shown. Try again in a minute.",
};

/**
 * Every row a course's materials list shows: saved materials and, when the
 * teacher's Canvas connection can reach it, the Canvas course's Pages and
 * Files. `canvas` says why Canvas items are missing, if they are.
 */
export async function loadMaterialRows(
  db: Db,
  actor: Actor,
  courseId: string,
): Promise<{ rows: MaterialRow[]; canvas: "connected" | "not-connected" | CourseContentProblem }> {
  const teacherCanvas = await clientFor(db, actor).catch((e) => {
    if (e instanceof VaultError) return null;
    throw e;
  });
  const [saved, listed] = await Promise.all([
    listCourseMaterials(db, actor, courseId),
    teacherCanvas ? listCourseCanvasContent(db, actor, teacherCanvas, courseId) : null,
  ]);
  return {
    rows: mergeMaterials(saved, listed?.ok ? listed.list : null),
    canvas: !listed ? "not-connected" : listed.ok ? "connected" : listed.reason,
  };
}
