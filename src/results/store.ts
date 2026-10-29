/**
 * What an attempt earned (db/migrations/*_results.sql), in one shape for every
 * tool (CLAUDE.md: the interaction may vary freely; the assessed output may
 * not). A tool's grader turns its own activity into a `GradedResult`; the
 * chassis stores it, totals it and reports on it without knowing the tool.
 *
 * Grading is claimed before the model is called, so two requests that both
 * see a finished attempt grade it once. A failed or stuck grading can be
 * claimed again; a graded attempt never is.
 */

import { z } from "zod";
import type { Db } from "@/db/types";

/** Grading left 'grading' this long belongs to a request that died; it may be claimed again. */
const STALE_GRADING_SECONDS = 300;

/** A quote from the student's own words, or NULL when there's none to show. */
const Evidence = z.string().min(1).nullable();

export const CriterionResult = z
  .strictObject({
    label: z.string().min(1),
    score: z.number().min(0),
    max: z.number().positive(),
    evidence: Evidence,
    feedback: z.string().min(1),
  })
  .refine((c) => c.score <= c.max, { message: "A criterion's score can't be more than its points." });

export const GradedResult = z.strictObject({
  criteria: z.array(CriterionResult).min(1),
  touchpoints: z.array(z.strictObject({ label: z.string().min(1), hit: z.boolean(), evidence: Evidence })),
  /** The position the student took; NULL when none. */
  position: z.string().min(1).nullable(),
  /** A few sentences to the student about the whole attempt. */
  feedback: z.string().min(1),
});

export type GradedResult = z.infer<typeof GradedResult>;

export type Result =
  | { status: "grading" | "failed" }
  | ({ status: "graded"; score: number; maxScore: number; gradedAt: Date } & GradedResult);

/** Total points earned and possible, from the criteria. */
export function totals(result: GradedResult): { score: number; maxScore: number } {
  const sum = (pick: (c: GradedResult["criteria"][number]) => number) =>
    Math.round(result.criteria.reduce((total, c) => total + pick(c), 0) * 100) / 100;
  return { score: sum((c) => c.score), maxScore: sum((c) => c.max) };
}

/**
 * Starts grading a completed attempt. True when this caller should grade it
 * now; false when it's graded already, another request is grading it, or the
 * attempt isn't finished.
 */
export async function claimGrading(db: Db, attemptId: string): Promise<boolean> {
  const [claimed] = await db.query<{ attemptId: string }>(
    `insert into results (attempt_id)
     select id from attempts where id = $1 and status = 'completed'
     on conflict (attempt_id) do update set status = 'grading', started_at = now()
       where results.status = 'failed'
          or (results.status = 'grading' and results.started_at < now() - make_interval(secs => $2))
     returning attempt_id as "attemptId"`,
    [attemptId, STALE_GRADING_SECONDS],
  );
  return claimed !== undefined;
}

/** Saves a claimed attempt's grade. Throws if `result` doesn't fit the shared shape. */
export async function saveGrade(db: Db, attemptId: string, result: GradedResult): Promise<void> {
  const checked = GradedResult.parse(result);
  const { score, maxScore } = totals(checked);
  await db.query(
    `update results
        set status = 'graded', score = $2, max_score = $3, criteria = $4::text::jsonb, touchpoints = $5::text::jsonb,
            position = $6, feedback = $7, graded_at = now()
      where attempt_id = $1 and status <> 'graded'`,
    [
      attemptId,
      score,
      maxScore,
      JSON.stringify(checked.criteria),
      JSON.stringify(checked.touchpoints),
      checked.position,
      checked.feedback,
    ],
  );
}

/** Marks a claimed grading as failed, so it can be tried again. A grade already saved stays. */
export async function failGrading(db: Db, attemptId: string): Promise<void> {
  await db.query("update results set status = 'failed' where attempt_id = $1 and status = 'grading'", [attemptId]);
}

/** An attempt's result; null before grading has started. */
export async function getResult(db: Db, attemptId: string): Promise<Result | null> {
  const [row] = await db.query<{
    status: Result["status"];
    score: number | null;
    maxScore: number | null;
    criteria: GradedResult["criteria"] | null;
    touchpoints: GradedResult["touchpoints"] | null;
    position: string | null;
    feedback: string | null;
    gradedAt: Date | null;
  }>(
    `select status, score::float8 as score, max_score::float8 as "maxScore", criteria, touchpoints, position, feedback,
            graded_at as "gradedAt"
       from results where attempt_id = $1`,
    [attemptId],
  );
  if (!row) return null;
  if (row.status !== "graded") return { status: row.status };
  return {
    status: "graded",
    score: row.score!,
    maxScore: row.maxScore!,
    gradedAt: row.gradedAt!,
    criteria: row.criteria!,
    touchpoints: row.touchpoints!,
    position: row.position,
    feedback: row.feedback!,
  };
}
