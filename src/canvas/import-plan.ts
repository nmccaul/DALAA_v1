/**
 * What bringing a Canvas course into DALAA will create. Pure, so every Canvas
 * oddity is a fixture test (docs/CANVAS.md "Course import + roster").
 *
 * - Students are keyed on NetID (Canvas login_id). No NetID, no account:
 *   we never match or create people by name.
 * - Active and invited students are added. Dropped ("completed") and
 *   inactive ones are not; they're counted so the teacher isn't surprised.
 * - A student in two sections is added once with no section, and counted:
 *   DALAA doesn't guess which section is theirs.
 */

import { normalizeNetId } from "@/auth/admit";
import type { CanvasEnrollment, CanvasSection } from "./client";

export type PlannedStudent = { netId: string; name: string; canvasSectionId: number | null };

export type ImportPlan = {
  sections: { canvasSectionId: number; name: string }[];
  students: PlannedStudent[];
  skipped: { notEnrolled: number; noNetId: number; inTwoSections: number };
};

const CURRENT = new Set(["active", "invited"]);

export function planImport(sections: CanvasSection[], enrollments: CanvasEnrollment[]): ImportPlan {
  const byUser = new Map<number, { user: CanvasEnrollment["user"]; sectionIds: Set<number> }>();
  const notEnrolledUsers = new Set<number>();

  for (const e of enrollments) {
    if (!CURRENT.has(e.enrollment_state)) {
      notEnrolledUsers.add(e.user_id);
      continue;
    }
    const entry = byUser.get(e.user_id) ?? { user: e.user, sectionIds: new Set<number>() };
    entry.sectionIds.add(e.course_section_id);
    byUser.set(e.user_id, entry);
  }

  const students: PlannedStudent[] = [];
  let noNetId = 0;
  let inTwoSections = 0;
  const seenNetIds = new Set<string>();
  for (const { user, sectionIds } of byUser.values()) {
    const netId = normalizeNetId(user.login_id ?? "");
    if (!netId || seenNetIds.has(netId)) {
      noNetId++;
      continue;
    }
    seenNetIds.add(netId);
    const onlySection = sectionIds.size === 1 ? [...sectionIds][0] : null;
    if (sectionIds.size > 1) inTwoSections++;
    students.push({ netId, name: user.name, canvasSectionId: onlySection });
  }

  // Someone dropped from one section but active in another is enrolled, not dropped.
  const notEnrolled = [...notEnrolledUsers].filter((id) => !byUser.has(id)).length;

  return {
    sections: sections.map((s) => ({ canvasSectionId: s.id, name: s.name })),
    students,
    skipped: { notEnrolled, noNetId, inTwoSections },
  };
}
