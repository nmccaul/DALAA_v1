/**
 * What a student sees of their own result, for every tool: the score, what
 * each criterion earned and why, and the points they raised. While grading
 * runs the page refreshes itself until the grade is in. Once graded the
 * student can dispute it (src/results/disputes.ts).
 */

import { LocalTime } from "@/components/local-time";
import { Button, inputStyles } from "@/components/ui";
import { points, ResultBreakdown } from "./breakdown";
import { openDisputeAction } from "./dispute-actions";
import { MAX_REASON, type Dispute } from "./disputes";
import { countedScore, type Result } from "./store";
import { RefreshWhileGrading } from "./refresh-while-grading";

/**
 * `result`: NULL before grading has started, which the student sees as
 * grading. `dispute`: the student's latest dispute of it, or NULL.
 */
export function StudentResult({
  result,
  attemptId,
  activityId,
  dispute,
}: {
  result: Result | null;
  attemptId: string;
  activityId: string;
  dispute: Dispute | null;
}) {
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
    <section
      id="your-grade"
      aria-label="Your grade"
      className="flex scroll-mt-4 flex-col gap-4 rounded-panel border border-border bg-surface px-4 py-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold">
          Your grade: {countedScore(result).toLocaleString("en-US", { maximumFractionDigits: 2 })} of {points(result.maxScore)}
        </h2>
        {result.teacherScore !== null && (
          <p className="text-sm text-muted">Your teacher set this grade. The scores below are from the first grading.</p>
        )}
        <p className="max-w-[65ch]">{result.feedback}</p>
      </div>
      <ResultBreakdown result={result} raised="Points you raised" />
      <DisputeBox attemptId={attemptId} activityId={activityId} dispute={dispute} />
    </section>
  );
}

/** The latest dispute and the teacher's answer, or the form to send one when none is open. */
function DisputeBox({ attemptId, activityId, dispute }: { attemptId: string; activityId: string; dispute: Dispute | null }) {
  if (dispute?.status === "open") {
    return (
      <div className="flex flex-col gap-1 border-t border-border pt-3" role="status">
        <p className="font-medium">You disputed this grade on <LocalTime value={dispute.openedAt} style="day" />.</p>
        <p className="text-sm text-muted">Your teacher will look at it. Your reason:</p>
        <blockquote className="max-w-[65ch] border-l-2 border-border-strong pl-3 text-sm whitespace-pre-wrap break-words text-muted">
          {dispute.reason}
        </blockquote>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      {dispute && (
        <div className="flex flex-col gap-1">
          <p className="font-medium">Your teacher looked at your dispute on <LocalTime value={dispute.resolvedAt!} style="day" />.</p>
          {dispute.response && (
            <blockquote className="max-w-[65ch] border-l-2 border-border-strong pl-3 whitespace-pre-wrap break-words">
              {dispute.response}
            </blockquote>
          )}
        </div>
      )}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-accent-text select-none hover:underline">
          {dispute ? "Dispute it again" : "Dispute this grade"}
        </summary>
        <form action={openDisputeAction} className="mt-3 flex max-w-[65ch] flex-col gap-2">
          <input type="hidden" name="activityId" value={activityId} />
          <input type="hidden" name="attemptId" value={attemptId} />
          <input type="hidden" name="clientKey" value={crypto.randomUUID()} />
          <label htmlFor={`reason-${attemptId}`} className="text-sm text-muted">
            Tell your teacher what you think the grade missed.
          </label>
          <textarea
            id={`reason-${attemptId}`}
            name="reason"
            required
            maxLength={MAX_REASON}
            rows={4}
            className={inputStyles}
          />
          <Button className="self-start">Send to your teacher</Button>
        </form>
      </details>
    </div>
  );
}
