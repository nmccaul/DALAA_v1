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
  /** Each graded student's share of the points (0–1), the score that counts (the teacher's when set). */
  scores: number[];
  /** The class's average share of the points; NULL with nothing graded. */
  average: number | null;
  positions: Tally[];
  /** Graded students who took no position. */
  noPosition: number;
  touchpoints: Tally[];
  criteria: CriterionAverage[];
};

export type GradedRow = {
  attemptId: string;
  studentName: string;
  /** The score that counts and what it's out of. */
  score: number;
  maxScore: number;
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
  const raised = tally(
    rows.flatMap((r) =>
      r.touchpoints
        .filter((t) => t.hit)
        .map((t) => ({ label: t.label, quote: { attemptId: r.attemptId, studentName: r.studentName, text: t.evidence } })),
    ),
  );
  // A point nobody raised is listed too, last: often the one the teacher most needs to see.
  const never = [...new Set(rows.flatMap((r) => r.touchpoints.map((t) => t.label)))].filter((label) => !raised.some((t) => t.label === label));
  const touchpoints = [...raised, ...never.map((label) => ({ label, students: 0, quotes: [] }))];
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
  const scores = rows.map((r) => r.score / r.maxScore);
  const average = scores.length === 0 ? null : scores.reduce((sum, x) => sum + x, 0) / scores.length;
  return { graded: rows.length, scores, average, positions, noPosition: rows.filter((r) => !r.position).length, touchpoints, criteria };
}

/**
 * The criteria the class did worst on, by share of points: every one tied for
 * lowest, and none when there are fewer than two or all are level (all zero
 * isn't one criterion being weakest).
 */
export function weakestCriteria(criteria: readonly CriterionAverage[]): CriterionAverage[] {
  if (criteria.length < 2) return [];
  const share = (c: CriterionAverage) => c.average / c.max;
  const lowest = Math.min(...criteria.map(share));
  const weakest = criteria.filter((c) => share(c) === lowest);
  return weakest.length === criteria.length ? [] : weakest;
}

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/**
 * One student's grade in a line, for the AI reading the class's
 * conversations: it gets the numbers instead of working them out, which is
 * cheaper and right. Exported for tests.
 */
export function gradeLine(row: GradedRow): string {
  const missed = row.touchpoints.filter((t) => !t.hit).map((t) => t.label);
  return [
    `Scored ${pointsFormat.format(row.score)} of ${pointsFormat.format(row.maxScore)}`,
    ...(row.position ? [`position: ${row.position}`] : []),
    ...(missed.length > 0 ? [`missed: ${missed.join("; ")}`] : []),
  ].join(". ");
}

/** An activity's graded results, first graded first (Canvas's Student View left out). For a caller that has checked who's asking. */
export async function gradedRows(db: Db, activityId: string): Promise<GradedRow[]> {
  return db.query<GradedRow>(
    `select t.id as "attemptId", u.display_name as "studentName",
            coalesce(r.teacher_score, r.score)::float8 as score, r.max_score::float8 as "maxScore",
            r.position, r.touchpoints, r.criteria
       from results r
       join attempts t on t.id = r.attempt_id
       join activities a on a.id = t.activity_id
       join users u on u.id = t.user_id
       left join course_members m on m.course_id = a.course_id and m.user_id = t.user_id
      where a.id = $1 and r.status = 'graded' and m.student_view is not true
      order by r.graded_at, t.id`,
    [activityId],
  );
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
  const rows = await gradedRows(db, activity.id);
  return summarize(rows);
}
