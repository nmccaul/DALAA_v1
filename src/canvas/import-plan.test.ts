import { describe, expect, it } from "vitest";
import type { CanvasEnrollment, CanvasSection } from "./client";
import { planImport } from "./import-plan";
import { PRACTICE_ENROLLMENTS, PRACTICE_SECTIONS } from "./practice/data";

const section = (id: number, name = `S${id}`): CanvasSection => ({ id, name, course_id: 1, nonxlist_course_id: null });
let nextId = 1;
const enrolment = (
  userId: number,
  sectionId: number,
  state: CanvasEnrollment["enrollment_state"] = "active",
  login: string | null = `u${userId}`,
): CanvasEnrollment => ({
  id: nextId++,
  user_id: userId,
  course_section_id: sectionId,
  enrollment_state: state,
  user: { id: userId, name: `User ${userId}`, login_id: login },
});

describe("planImport", () => {
  it("adds active and invited students with their section, keyed on NetID", () => {
    const plan = planImport([section(10), section(20)], [enrolment(1, 10), enrolment(2, 20, "invited")]);
    expect(plan.students).toEqual([
      { netId: "u1", name: "User 1", canvasSectionId: 10 },
      { netId: "u2", name: "User 2", canvasSectionId: 20 },
    ]);
    expect(plan.sections).toEqual([{ canvasSectionId: 10, name: "S10" }, { canvasSectionId: 20, name: "S20" }]);
  });

  it("skips dropped and inactive students, and counts them", () => {
    const plan = planImport([section(10)], [enrolment(1, 10, "completed"), enrolment(2, 10, "inactive"), enrolment(3, 10)]);
    expect(plan.students.map((s) => s.netId)).toEqual(["u3"]);
    expect(plan.skipped.notEnrolled).toBe(2);
  });

  it("counts someone who moved sections as enrolled, not dropped", () => {
    const plan = planImport([section(10), section(20)], [enrolment(1, 10, "completed"), enrolment(1, 20)]);
    expect(plan.students).toEqual([{ netId: "u1", name: "User 1", canvasSectionId: 20 }]);
    expect(plan.skipped.notEnrolled).toBe(0);
  });

  it("adds a student in two sections once, with no section, and counts them", () => {
    const plan = planImport([section(10), section(20)], [enrolment(1, 10), enrolment(1, 20)]);
    expect(plan.students).toEqual([{ netId: "u1", name: "User 1", canvasSectionId: null }]);
    expect(plan.skipped.inTwoSections).toBe(1);
  });

  it("never adds someone without a usable NetID", () => {
    const plan = planImport([section(10)], [enrolment(1, 10, "active", null), enrolment(2, 10, "active", "bad id")]);
    expect(plan.students).toEqual([]);
    expect(plan.skipped.noNetId).toBe(2);
  });

  it("handles every awkward case in practice Canvas's BUS M 361", () => {
    const plan = planImport(
      PRACTICE_SECTIONS.filter((s) => s.course_id === 1101),
      PRACTICE_ENROLLMENTS.get(1101)!,
    );
    expect(plan.sections).toHaveLength(3);
    expect(plan.students).toHaveLength(48); // 46 regular + two-section student + invited
    expect(plan.skipped).toEqual({ notEnrolled: 2, noNetId: 1, inTwoSections: 1 });
    expect(plan.students.every((s) => s.netId.startsWith("practice."))).toBe(true);
  });
});
