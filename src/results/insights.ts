/**
 * What the class did on an activity, for every tool (D-035), from the shared
 * results shape: which positions students took, which points they raised
 * (with the grader's quote for each), and how the class did on each rubric
 * criterion. Only graded attempts count, and Canvas's Student View user never
 * does. Nothing here reads a tool's settings.
 */

import { and, coursesTaughtBy, type Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import type { GradedResult } from "./store";

/** One student's words, with whose they are; the page decides whether to show the name. */
export type Quote = { attemptId: string; studentName: string; text: string | null };

export type Tally = { label: string; students: number; quotes: Quote[] };

export type CriterionAverage = { label: string; average: number; max: number; students: number };

export type ClassInsights = {
  /** Graded students: what every share is "of". */
  graded: number;
  positions: Tally[];
  /** Graded students who took no position. */
  noPosition: number;
  touchpoints: Tally[];
  criteria: CriterionAverage[];
};

export type GradedRow = {
  attemptId: string;
  studentName: string;
  position: string | null;
  touchpoints: GradedResult["touchpoints"];
  criteria: GradedResult["criteria"];
};

/** Groups by label as written, most students first; ties keep the order they were first seen. */
function tally(entries: { label: string; quote: Quote }[]): Tally[] {
  const byLabel = new Map<string, Tally>();
  for (const { label, quote } of entries) {
    const row = byLabel.get(label) ?? { label, students: 0, quotes: [] };
    row.students += 1;
    row.quotes.push(quote);
    byLabel.set(label, row);
  }
  return [...byLabel.values()].sort((a, b) => b.students - a.students);
}

/** The class view from its graded results. Exported for tests. */
export function summarize(rows: readonly GradedRow[]): ClassInsights {
  const positions = tally(
    rows.flatMap((r) =>
      r.position ? [{ label: r.position, quote: { attemptId: r.attemptId, studentName: r.studentName, text: null } }] : [],
    ),
  );
  const touchpoints = tally(
    rows.flatMap((r) =>
      r.touchpoints
        .filter((t) => t.hit)
        .map((t) => ({ label: t.label, quote: { attemptId: r.attemptId, studentName: r.studentName, text: t.evidence } })),
    ),
  );
  const sums = new Map<string, { total: number; max: number; students: number }>();
  for (const r of rows) {
    for (const c of r.criteria) {
      const s = sums.get(c.label) ?? { total: 0, max: c.max, students: 0 };
      s.total += c.score / c.max;
      s.students += 1;
      sums.set(c.label, s);
    }
  }
  const criteria = [...sums].map(([label, s]) => ({
    label,
    max: s.max,
    students: s.students,
    // The average share of the criterion earned, in the criterion's latest points.
    average: Math.round((s.total / s.students) * s.max * 100) / 100,
  }));
  return { graded: rows.length, positions, noPosition: rows.filter((r) => !r.position).length, touchpoints, criteria };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The class view of an activity in a course the actor teaches; NULL for anyone else's. */
export async function classInsights(db: Db, actor: Actor, activityId: string): Promise<ClassInsights | null> {
  if (!UUID.test(activityId)) return null;
  const where = and({ text: "a.id = $1", values: [activityId] }, coursesTaughtBy(actor, "c"));
  const [activity] = await db.query<{ id: string }>(
    `select a.id from activities a join courses c on c.id = a.course_id where ${where.text}`,
    where.values,
  );
  if (!activity) return null;
  const rows = await db.query<GradedRow>(
    `select t.id as "attemptId", u.display_name as "studentName", r.position, r.touchpoints, r.criteria
       from results r
       join attempts t on t.id = r.attempt_id
       join activities a on a.id = t.activity_id
       join users u on u.id = t.user_id
       left join course_members m on m.course_id = a.course_id and m.user_id = t.user_id
      where a.id = $1 and r.status = 'graded' and m.student_view is not true
      order by r.graded_at, t.id`,
    [activity.id],
  );
  return summarize(rows);
}
