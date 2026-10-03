/**
 * "Bring in from Canvas": one click creates the course, its sections and its
 * roster (PRD §5 step 4). Reads from Canvas only; nothing changes in Canvas.
 */

import { createCourse } from "@/courses/create";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { CanvasError, type CanvasCourse } from "./client";
import type { TeacherCanvas } from "./connection";
import { planImport, type ImportPlan } from "./import-plan";

/**
 * How a Canvas id is stored. Practice ids are namespaced per teacher, so two
 * teachers trying practice Canvas each get their own copy (no unique clash).
 */
export function storedCanvasId(canvas: TeacherCanvas, actor: Actor, id: number): string {
  return canvas.mode === "practice" ? `practice:${actor.userId}:${id}` : String(id);
}

export type ImportableCourse = CanvasCourse & { dalaaCourseId: string | null };

/** The teacher's Canvas courses, each marked if it's already in DALAA. */
export async function listImportable(db: Db, actor: Actor, canvas: TeacherCanvas): Promise<ImportableCourse[]> {
  const courses = await canvas.client.coursesTaught();
  const keys = courses.map((c) => storedCanvasId(canvas, actor, c.id));
  const existing = await db.query<{ id: string; canvas_course_id: string }>(
    "select id, canvas_course_id from courses where institution_id = $1 and canvas_course_id = any($2::text[])",
    [actor.institutionId, keys],
  );
  const byKey = new Map(existing.map((r) => [r.canvas_course_id, r.id]));
  return courses.map((c) => ({ ...c, dalaaCourseId: byKey.get(storedCanvasId(canvas, actor, c.id)) ?? null }));
}

export type ImportResult =
  | { ok: true; courseId: string; added: number; skipped: ImportPlan["skipped"]; alreadyInDalaa: boolean }
  | { ok: false; reason: "not-yours" | "taken" | "section-taken" | "reconnect" | "unavailable" };

export async function importCourse(
  db: Db,
  actor: Actor,
  canvas: TeacherCanvas,
  canvasCourseId: number,
  creationKey: string,
): Promise<ImportResult> {
  if (!actor.isStaff) throw new Error("Only instructors bring in courses");
  const none = { notEnrolled: 0, noNetId: 0, inTwoSections: 0 };
  const key = storedCanvasId(canvas, actor, canvasCourseId);

  const [existing] = await db.query<{ id: string; teaches: boolean }>(
    `select c.id, exists (select 1 from course_members m
                           where m.course_id = c.id and m.user_id = $3 and m.role = 'instructor') as teaches
       from courses c where c.institution_id = $1 and c.canvas_course_id = $2`,
    [actor.institutionId, key, actor.userId],
  );
  if (existing) {
    return existing.teaches
      ? { ok: true, courseId: existing.id, added: 0, skipped: none, alreadyInDalaa: true }
      : { ok: false, reason: "taken" };
  }

  let course: CanvasCourse | undefined;
  let plan: ImportPlan;
  try {
    course = (await canvas.client.coursesTaught()).find((c) => c.id === canvasCourseId);
    if (!course) return { ok: false, reason: "not-yours" };
    const [sections, enrollments] = await Promise.all([
      canvas.client.sections(canvasCourseId),
      canvas.client.studentEnrollments(canvasCourseId),
    ]);
    plan = planImport(sections, enrollments);
  } catch (e) {
    if (e instanceof CanvasError && e.kind === "token-rejected") return { ok: false, reason: "reconnect" };
    return { ok: false, reason: "unavailable" };
  }

  const sectionNames = uniqueNames(plan.sections);
  try {
    const created = await createCourse(db, actor, {
      creationKey,
      code: course.course_code,
      title: course.name,
      term: course.term?.name ?? "No term in Canvas",
      students: plan.students.map((s) => ({
        netId: s.netId,
        name: s.name,
        section: s.canvasSectionId === null ? null : (sectionNames.get(s.canvasSectionId) ?? null),
      })),
      canvas: {
        courseId: key,
        isPractice: canvas.mode === "practice",
        sections: plan.sections.map((s) => ({
          name: sectionNames.get(s.canvasSectionId)!,
          canvasSectionId: storedCanvasId(canvas, actor, s.canvasSectionId),
        })),
      },
    });
    return { ok: true, courseId: created.courseId, added: created.studentsAdded, skipped: plan.skipped, alreadyInDalaa: created.alreadyExisted };
  } catch (e) {
    // A cross-listed section can already belong to another DALAA course.
    if ((e as { code?: string }).code === "23505" && /canvas_section_id/.test(String((e as Error).message) + String((e as { detail?: string }).detail))) {
      return { ok: false, reason: "section-taken" };
    }
    throw e;
  }
}

/** Canvas allows two sections with the same name; DALAA needs them distinct. */
function uniqueNames(sections: ImportPlan["sections"]): Map<number, string> {
  const used = new Map<string, number>();
  const names = new Map<number, string>();
  for (const s of sections) {
    const count = (used.get(s.name) ?? 0) + 1;
    used.set(s.name, count);
    names.set(s.canvasSectionId, count === 1 ? s.name : `${s.name} (${count})`);
  }
  return names;
}
