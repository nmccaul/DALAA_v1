/**
 * Which grades a "Send grades to Canvas" would send, and why the rest aren't
 * sent (CLAUDE.md, docs/CANVAS.md). Pure, for every tool and either way of
 * reaching Canvas, so each rule is a fixture test and only the sender knows
 * about AGS. Three facts are compared and never merged: the score that counts
 * in DALAA, what DALAA last sent and Canvas confirmed, and what Canvas holds.
 */

export type PushStudent = {
  userId: string;
  name: string;
  /** The score that counts (the teacher's if set) and what it's out of; NULL until graded. */
  score: number | null;
  maxScore: number | null;
  /** The platform's id for them; NULL when Canvas has never launched or synced them. */
  sub: string | null;
  /** The last score Canvas confirmed from DALAA; NULL when none was ever sent. */
  lastSent: number | null;
};

export type PushCategory =
  | "send"
  | "lowered" // lower than what Canvas holds: sent only when the teacher says so
  | "unchanged" // Canvas already holds this score
  | "changed_in_canvas" // someone changed it in Canvas since DALAA sent it: reported, never overwritten
  | "not_graded" // never sent as zero
  | "not_in_canvas" // Canvas hasn't launched or synced them, so there's no one to send it to
  | "points_mismatch"; // graded out of different points than the assignment: refused, never rescaled

export type PushLine = PushStudent & { category: PushCategory; canvasScore: number | null };

export type PushPlan =
  | { ok: true; lines: PushLine[] }
  | { ok: false; reason: "points_mismatch"; points: number; canvasPoints: number };

/** Scores are kept to two decimals; compare them that way. */
const same = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.round(a * 100) === Math.round(b * 100);

/**
 * `canvasScores` is what Canvas holds, by platform id (a missing id or NULL:
 * no score). A gradebook column out of other points than the assignment
 * refuses the whole push.
 */
export function planPush(
  points: number,
  canvasPoints: number,
  students: PushStudent[],
  canvasScores: ReadonlyMap<string, number | null>,
): PushPlan {
  if (!same(points, canvasPoints)) return { ok: false, reason: "points_mismatch", points, canvasPoints };
  const lines = students.map((s): PushLine => {
    const canvasScore = s.sub === null ? null : (canvasScores.get(s.sub) ?? null);
    return { ...s, canvasScore, category: categorize(points, s, canvasScore) };
  });
  return { ok: true, lines };
}

function categorize(points: number, s: PushStudent, canvasScore: number | null): PushCategory {
  if (s.score === null) return "not_graded";
  if (!same(s.maxScore, points)) return "points_mismatch";
  if (s.sub === null) return "not_in_canvas";
  if (same(canvasScore, s.score)) return "unchanged";
  if (!same(canvasScore, s.lastSent)) return "changed_in_canvas";
  if (canvasScore !== null && s.score < canvasScore) return "lowered";
  return "send";
}

/** The lines a push sends: new and raised scores, and lowered ones only when the teacher confirmed them. */
export function linesToSend(plan: PushPlan, opts: { includeLowered: boolean }): PushLine[] {
  if (!plan.ok) return [];
  return plan.lines.filter((l) => l.category === "send" || (opts.includeLowered && l.category === "lowered"));
}

/** Whether the teacher has anything to decide before sending (CLAUDE.md: the clean case is one click). */
export function needsPreview(plan: PushPlan): boolean {
  return !plan.ok || plan.lines.some((l) => l.category !== "send" && l.category !== "unchanged" && l.category !== "not_graded");
}
