import { describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import { classInsights, summarize, type GradedRow } from "./insights";

const row = (n: number, position: string | null, hits: string[], scores: number[]): GradedRow => ({
  attemptId: `a${n}`,
  studentName: `S${n}`,
  position,
  touchpoints: ["Cash", "Season"].map((label) => ({ label, hit: hits.includes(label), evidence: hits.includes(label) ? `${label} said by S${n}` : null })),
  criteria: scores.map((score, i) => ({ label: `C${i}`, score, max: 4, evidence: null, feedback: "." })),
});

describe("summarize", () => {
  it("counts positions and points raised, most first, keeping each student's quote", () => {
    const view = summarize([row(1, "Wait", ["Cash"], [4, 1]), row(2, "Open", ["Cash", "Season"], [2, 1]), row(3, "Wait", [], [3, 1]), row(4, null, [], [1, 1])]);
    expect(view.graded).toBe(4);
    expect(view.noPosition).toBe(1);
    expect(view.positions.map((p) => [p.label, p.students])).toEqual([["Wait", 2], ["Open", 1]]);
    expect(view.positions[0].quotes.map((q) => q.attemptId)).toEqual(["a1", "a3"]);
    expect(view.touchpoints.map((t) => [t.label, t.students])).toEqual([["Cash", 2], ["Season", 1]]);
    expect(view.touchpoints[1].quotes).toEqual([{ attemptId: "a2", studentName: "S2", text: "Season said by S2" }]);
    expect(view.criteria).toEqual([
      { label: "C0", average: 2.5, max: 4, students: 4 },
      { label: "C1", average: 1, max: 4, students: 4 },
    ]);
  });

  it("is empty with nothing graded", () => {
    expect(summarize([])).toEqual({ graded: 0, positions: [], noPosition: 0, touchpoints: [], criteria: [] });
  });
});

describe("classInsights", () => {
  it("reads graded results for the course's teacher only, leaving out Student View and ungraded attempts", async () => {
    const db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const user = async (netId: string, isStaff: boolean): Promise<Actor> => {
      const [{ id }] = await db.query<{ id: string }>(
        "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
        [inst, netId],
      );
      return { userId: id, institutionId: inst, netId, displayName: netId, isStaff, isAdmin: false };
    };
    const prof = await user("prof", true);
    const other = await user("other", true);
    const [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, prof.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [course, prof.userId]);
    const [{ id: activity }] = await db.query<{ id: string }>(
      "insert into activities (course_id, tool, title, settings, status, points, created_by) values ($1, 'study-chat', 'A', '{}', 'published', 10, $2) returning id",
      [course, prof.userId],
    );
    const take = async (netId: string, graded: boolean, studentView = false) => {
      const s = await user(netId, false);
      await db.query("insert into course_members (course_id, user_id, role, student_view) values ($1, $2, 'student', $3)", [course, s.userId, studentView]);
      const [{ id }] = await db.query<{ id: string }>(
        "insert into attempts (activity_id, user_id, status, ended_by, completed_at) values ($1, $2, 'completed', 'student', now()) returning id",
        [activity, s.userId],
      );
      if (graded) {
        await db.query(
          `insert into results (attempt_id, status, score, max_score, criteria, touchpoints, position, feedback, graded_at)
           values ($1, 'graded', 3, 4, '[{"label":"Q","score":3,"max":4,"evidence":null,"feedback":"."}]',
                   '[{"label":"Cash","hit":true,"evidence":"cash is tight"}]', 'Wait', 'Ok.', now())`,
          [id],
        );
      } else {
        await db.query("insert into results (attempt_id) values ($1)", [id]);
      }
    };
    await take("ana", true);
    await take("ben", false);
    await take("test", true, true);

    const view = await classInsights(db, prof, activity);
    expect(view).toMatchObject({ graded: 1, noPosition: 0, criteria: [{ label: "Q", average: 3, max: 4, students: 1 }] });
    expect(view?.positions).toEqual([{ label: "Wait", students: 1, quotes: [expect.objectContaining({ studentName: "ana", text: null })] }]);
    expect(view?.touchpoints[0].quotes[0]).toMatchObject({ studentName: "ana", text: "cash is tight" });
    expect(await classInsights(db, other, activity)).toBeNull();
    expect(await classInsights(db, prof, "nope")).toBeNull();
  });
});
