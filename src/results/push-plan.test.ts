import { describe, expect, it } from "vitest";
import { linesToSend, needsPreview, planPush, type PushStudent } from "./push-plan";

const student = (name: string, extra: Partial<PushStudent> = {}): PushStudent => ({
  userId: `u-${name}`,
  name,
  score: 8,
  maxScore: 10,
  sub: `sub-${name}`,
  lastSent: null,
  ...extra,
});

const categories = (plan: ReturnType<typeof planPush>) => (plan.ok ? plan.lines.map((l) => [l.name, l.category, l.canvasScore]) : plan);

describe("planPush", () => {
  it("sends a new score and a raised one", () => {
    const plan = planPush(10, 10, [student("new"), student("raised", { score: 9, lastSent: 7 })], new Map([["sub-raised", 7]]));
    expect(categories(plan)).toEqual([
      ["new", "send", null],
      ["raised", "send", 7],
    ]);
    expect(needsPreview(plan)).toBe(false);
  });

  it("skips a score Canvas already holds, whether or not DALAA sent it", () => {
    const plan = planPush(
      10,
      10,
      [student("sent", { lastSent: 8 }), student("typed", { score: 8.004 })],
      new Map([
        ["sub-sent", 8],
        ["sub-typed", 8],
      ]),
    );
    expect(categories(plan)).toEqual([
      ["sent", "unchanged", 8],
      ["typed", "unchanged", 8],
    ]);
    expect(linesToSend(plan, { includeLowered: true })).toEqual([]);
  });

  it("holds a lowered grade back unless the teacher confirms it", () => {
    const plan = planPush(10, 10, [student("lower", { score: 6, lastSent: 9 })], new Map([["sub-lower", 9]]));
    expect(categories(plan)).toEqual([["lower", "lowered", 9]]);
    expect(needsPreview(plan)).toBe(true);
    expect(linesToSend(plan, { includeLowered: false })).toEqual([]);
    expect(linesToSend(plan, { includeLowered: true }).map((l) => l.name)).toEqual(["lower"]);
  });

  it("reports a grade changed in Canvas and never overwrites it, even a cleared one", () => {
    const plan = planPush(
      10,
      10,
      [student("edited", { lastSent: 8, score: 9 }), student("cleared", { lastSent: 8 }), student("entered", { score: 7 })],
      new Map([
        ["sub-edited", 5],
        ["sub-entered", 10],
      ]),
    );
    expect(categories(plan)).toEqual([
      ["edited", "changed_in_canvas", 5],
      ["cleared", "changed_in_canvas", null],
      ["entered", "changed_in_canvas", 10],
    ]);
    expect(linesToSend(plan, { includeLowered: true })).toEqual([]);
    expect(needsPreview(plan)).toBe(true);
  });

  it("never sends no attempt as zero", () => {
    const plan = planPush(10, 10, [student("none", { score: null, maxScore: null })], new Map());
    expect(categories(plan)).toEqual([["none", "not_graded", null]]);
    expect(needsPreview(plan)).toBe(false);
  });

  it("lists a student Canvas has never launched or synced", () => {
    const plan = planPush(10, 10, [student("outside", { sub: null })], new Map());
    expect(categories(plan)).toEqual([["outside", "not_in_canvas", null]]);
    expect(needsPreview(plan)).toBe(true);
  });

  it("refuses a student graded out of other points instead of rescaling", () => {
    const plan = planPush(10, 10, [student("old", { score: 4, maxScore: 5 })], new Map());
    expect(categories(plan)).toEqual([["old", "points_mismatch", null]]);
    expect(linesToSend(plan, { includeLowered: true })).toEqual([]);
  });

  it("refuses the whole push when the Canvas column is out of other points", () => {
    const plan = planPush(10, 20, [student("a")], new Map());
    expect(plan).toEqual({ ok: false, reason: "points_mismatch", points: 10, canvasPoints: 20 });
    expect(linesToSend(plan, { includeLowered: true })).toEqual([]);
    expect(needsPreview(plan)).toBe(true);
  });
});
