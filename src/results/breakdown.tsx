import type { GradedResult } from "./store";

export const points = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${n === 1 ? "point" : "points"}`;

/**
 * What each criterion earned and why, then the points raised, for every tool.
 * `raised` names the touchpoint meter ("Points you raised") for whoever reads it.
 */
export function ResultBreakdown({ result, raised }: { result: GradedResult; raised: string }) {
  return (
    <>
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
          <h3 className="font-medium">{raised} — {result.touchpoints.filter((t) => t.hit).length} of {result.touchpoints.length}</h3>
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
    </>
  );
}
