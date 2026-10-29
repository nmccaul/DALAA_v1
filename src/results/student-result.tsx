/**
 * What a student sees of their own result, for every tool: the score, what
 * each criterion earned and why, and the points they raised. While grading
 * runs the page refreshes itself until the grade is in.
 */

import { countedScore, type Result } from "./store";
import { RefreshWhileGrading } from "./refresh-while-grading";

const points = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${n === 1 ? "point" : "points"}`;

/** `result`: NULL before grading has started, which the student sees as grading. */
export function StudentResult({ result }: { result: Result | null }) {
  if (result === null || result.status === "grading") {
    return (
      <section aria-label="Your grade" className="rounded-panel border border-border bg-surface px-4 py-3">
        <p className="font-medium">Being graded…</p>
        <p className="text-sm text-muted">Your grade will show here in a minute or two.</p>
        <RefreshWhileGrading />
      </section>
    );
  }
  if (result.status !== "graded") {
    return (
      <section aria-label="Your grade" className="rounded-panel border border-border bg-surface px-4 py-3">
        <p className="font-medium">Your grade isn&apos;t ready yet.</p>
        <p className="text-sm text-muted">We&apos;re trying again. Reload this page in a minute or two.</p>
      </section>
    );
  }

  return (
    <section aria-label="Your grade" className="flex flex-col gap-4 rounded-panel border border-border bg-surface px-4 py-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold">
          Your grade: {countedScore(result).toLocaleString("en-US", { maximumFractionDigits: 2 })} of {points(result.maxScore)}
        </h2>
        {result.teacherScore !== null && (
          <p className="text-sm text-muted">Your teacher set this grade. The scores below are from the first grading.</p>
        )}
        <p className="max-w-[65ch]">{result.feedback}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {result.criteria.map((c, i) => (
          <li key={i} className="flex flex-col gap-1 border-t border-border pt-3">
            <p className="font-medium">
              {c.label} <span className="font-normal text-muted">— {c.score.toLocaleString("en-US", { maximumFractionDigits: 2 })} of {points(c.max)}</span>
            </p>
            <p className="max-w-[65ch]">{c.feedback}</p>
            {c.evidence && <blockquote className="max-w-[65ch] border-l-2 border-border-strong pl-3 text-sm text-muted">“{c.evidence}”</blockquote>}
          </li>
        ))}
      </ul>
      {result.touchpoints.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="font-medium">Points you raised — {result.touchpoints.filter((t) => t.hit).length} of {result.touchpoints.length}</h3>
          <ul className="flex flex-col gap-1">
            {result.touchpoints.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className={t.hit ? "text-accent-text" : "text-muted"}>
                  {t.hit ? "✓" : "○"}
                </span>
                <span>
                  {t.label}
                  <span className="sr-only">{t.hit ? ": raised" : ": not raised"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
