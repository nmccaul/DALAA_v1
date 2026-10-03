/**
 * Keeping a DALAA course's class list in step with Canvas
 * (docs/CANVAS.md "Course import + roster").
 *
 * - "Sync with Canvas": new students are added, returning ones reactivated,
 *   students who left are flagged. **Nobody is ever deleted** (CLAUDE.md):
 *   a flagged student's work stays.
 * - "Connect to Canvas": a hand-made course is linked to a Canvas course, then
 *   synced. Students match on NetID, so no one gets a second account (D-017).
 */

import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { upsertStudent } from "@/courses/students";
import { CanvasError } from "./client";
import type { TeacherCanvas } from "./connection";
import { storedCanvasId } from "./import";
import { planImport, type ImportPlan } from "./import-plan";

export type SyncCounts = { added: number; returned: number; flagged: number; moved: number };

export type SyncResult =
  | ({ ok: true } & SyncCounts & { skipped: ImportPlan["skipped"] })
  | { ok: false; reason: "not-linked" | "wrong-canvas" | "not-yours" | "taken" | "reconnect" | "unavailable" };

/** The Canvas course id behind a stored id ("123" or "practice:<user>:123"). */
export function canvasIdOf(stored: string): number {
  return Number(stored.split(":").at(-1));
}

type CourseRow = { id: string; canvas_course_id: string | null; is_practice: boolean };

async function taughtCourse(db: Db, actor: Actor, courseId: string): Promise<CourseRow | null> {
  const [row] = await db.query<CourseRow>(
    `select c.id, c.canvas_course_id, c.is_practice from courses c
      where c.id = $1 and exists (select 1 from course_members m where m.course_id = c.id
                                    and m.user_id = $2 and m.role = 'instructor' and m.status = 'active')`,
    [courseId, actor.userId],
  );
  return row ?? null;
}

async function fetchPlan(canvas: TeacherCanvas, canvasCourseId: number): Promise<ImportPlan | SyncResult> {
  try {
    const [sections, enrollments] = await Promise.all([
      canvas.client.sections(canvasCourseId),
      canvas.client.studentEnrollments(canvasCourseId),
    ]);
    return planImport(sections, enrollments);
  } catch (e) {
    if (e instanceof CanvasError && e.kind === "token-rejected") return { ok: false, reason: "reconnect" };
    if (e instanceof CanvasError && (e.kind === "not-found" || e.kind === "forbidden")) return { ok: false, reason: "not-yours" };
    return { ok: false, reason: "unavailable" };
  }
}

export async function syncRoster(db: Db, actor: Actor, canvas: TeacherCanvas, courseId: string): Promise<SyncResult> {
  if (!actor.isStaff) throw new Error("Only instructors sync rosters");
  const course = await taughtCourse(db, actor, courseId);
  if (!course?.canvas_course_id) return { ok: false, reason: "not-linked" };
  if (course.is_practice !== (canvas.mode === "practice")) return { ok: false, reason: "wrong-canvas" };

  const plan = await fetchPlan(canvas, canvasIdOf(course.canvas_course_id));
  if ("ok" in plan) return plan;
  const counts = await db.transaction((tx) => applyPlan(tx, actor, canvas, course.id, plan));
  return { ok: true, ...counts, skipped: plan.skipped };
}

export async function linkToCanvas(
  db: Db,
  actor: Actor,
  canvas: TeacherCanvas,
  courseId: string,
  canvasCourseId: number,
): Promise<SyncResult> {
  if (!actor.isStaff) throw new Error("Only instructors link courses");
  const course = await taughtCourse(db, actor, courseId);
  if (!course) return { ok: false, reason: "not-yours" };
  if (course.canvas_course_id) return syncRoster(db, actor, canvas, courseId);

  let teaches: boolean;
  try {
    teaches = (await canvas.client.coursesTaught()).some((c) => c.id === canvasCourseId);
  } catch (e) {
    return { ok: false, reason: e instanceof CanvasError && e.kind === "token-rejected" ? "reconnect" : "unavailable" };
  }
  if (!teaches) return { ok: false, reason: "not-yours" };

  const key = storedCanvasId(canvas, actor, canvasCourseId);
  const [taken] = await db.query("select 1 from courses where institution_id = $1 and canvas_course_id = $2", [
    actor.institutionId,
    key,
  ]);
  if (taken) return { ok: false, reason: "taken" };

  const plan = await fetchPlan(canvas, canvasCourseId);
  if ("ok" in plan) return plan;
  const counts = await db.transaction(async (tx) => {
    await tx.query("update courses set canvas_course_id = $2, is_practice = $3 where id = $1", [
      courseId,
      key,
      canvas.mode === "practice",
    ]);
    return applyPlan(tx, actor, canvas, courseId, plan);
  });
  return { ok: true, ...counts, skipped: plan.skipped };
}

/** Make the course's sections and students match the plan. Adds and flags; never deletes. */
async function applyPlan(tx: Db, actor: Actor, canvas: TeacherCanvas, courseId: string, plan: ImportPlan): Promise<SyncCounts> {
  // Sections: match by Canvas id, else adopt a hand-made section of the same name, else create.
  const sectionByCanvasId = new Map<number, string>();
  for (const s of plan.sections) {
    const canvasKey = storedCanvasId(canvas, actor, s.canvasSectionId);
    const [linked] = await tx.query<{ id: string }>(
      "select id from sections where course_id = $1 and canvas_section_id = $2",
      [courseId, canvasKey],
    );
    const [adopted] = linked
      ? [linked]
      : await tx.query<{ id: string }>(
          `update sections set canvas_section_id = $3
            where course_id = $1 and name = $2 and canvas_section_id is null returning id`,
          [courseId, s.name, canvasKey],
        );
    const [created] =
      linked || adopted
        ? [linked ?? adopted]
        : await tx.query<{ id: string }>(
            `insert into sections (course_id, name, canvas_section_id)
             values ($1, case when exists (select 1 from sections where course_id = $1 and name = $2)
                              then $2 || ' (Canvas)' else $2 end, $3)
             returning id`,
            [courseId, s.name, canvasKey],
          );
    sectionByCanvasId.set(s.canvasSectionId, created.id);
  }

  const members = await tx.query<{ user_id: string; net_id: string; status: string; section_id: string | null }>(
    `select m.user_id, u.external_id as net_id, m.status, m.section_id
       from course_members m join users u on u.id = m.user_id
      where m.course_id = $1 and m.role = 'student'`,
    [courseId],
  );
  const byNetId = new Map(members.map((m) => [m.net_id, m]));
  const counts: SyncCounts = { added: 0, returned: 0, flagged: 0, moved: 0 };
  const inCanvas = new Set<string>();

  for (const student of plan.students) {
    if (student.netId === actor.netId) continue;
    inCanvas.add(student.netId);
    // No section means "in two sections in Canvas": keep whatever DALAA has; don't guess.
    const section = student.canvasSectionId === null ? undefined : sectionByCanvasId.get(student.canvasSectionId);
    const member = byNetId.get(student.netId);
    if (!member) {
      const userId = await upsertStudent(tx, actor.institutionId, student.netId, student.name);
      await tx.query(
        "insert into course_members (course_id, user_id, role, section_id) values ($1, $2, 'student', $3)",
        [courseId, userId, section ?? null],
      );
      counts.added++;
      continue;
    }
    if (member.status === "flagged") counts.returned++;
    else if (section !== undefined && section !== member.section_id) counts.moved++;
    await tx.query(
      `update course_members set status = 'active', section_id = coalesce($3, section_id)
        where course_id = $1 and user_id = $2`,
      [courseId, member.user_id, section ?? null],
    );
  }

  for (const m of members) {
    if (m.status === "active" && !inCanvas.has(m.net_id)) {
      await tx.query("update course_members set status = 'flagged' where course_id = $1 and user_id = $2", [
        courseId,
        m.user_id,
      ]);
      counts.flagged++;
    }
  }

  await tx.query("update courses set canvas_synced_at = now() where id = $1", [courseId]);
  return counts;
}
