import { X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { db } from "@/db/client";
import type { Actor } from "@/db/scope";
import { getTaughtAttempt } from "@/results/attempt";
import { ResultBreakdown } from "@/results/breakdown";
import { latestDispute } from "@/results/disputes";
import type { CanvasState } from "@/results/gradebook";
import { getResult } from "@/results/store";
import { screensFor } from "@/tools/screens";
import { DisputeForm, ScoreForm } from "./score-forms";
import { SCORE_ERRORS } from "./score-errors";
import { gradebookPath, insightsPath } from "./view";

const ENDED: Record<string, string> = {
  turns: "used all their messages",
  time: "ran out of time",
  question: "answered the chat's question",
  student: "finished it themselves",
};

const pts = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

type Query = Record<string, string | string[] | undefined>;

/**
 * One student's grade, opened beside the Gradebook (D-046): where it stands
 * with Canvas, the score to change with a reason (or a dispute to answer),
 * the grader's breakdown, and the whole conversation. Up and down the same
 * assignment's column without leaving the page.
 */
export async function GradePanel({
  actor,
  courseId,
  attemptId,
  canvas,
  lastSent,
  linked,
  neighbors,
  assignment,
  q,
}: {
  actor: Actor;
  courseId: string;
  attemptId: string;
  canvas: CanvasState;
  lastSent: number | null;
  linked: boolean;
  neighbors: { prev: string | null; next: string | null; at: number; of: number };
  assignment: string | null;
  q: Query;
}) {
  const attempt = await getTaughtAttempt(db(), actor, attemptId);
  if (!attempt || attempt.courseId !== courseId) return null;
  const [result, dispute] = await Promise.all([getResult(db(), attempt.id), latestDispute(db(), attempt.id)]);
  const Transcript = screensFor(attempt.tool)?.transcript;
  const fromInsights = q.from === "insights";
  const place = { assignment: assignment ?? undefined, from: fromInsights ? "insights" : undefined };
  const here = gradebookPath(courseId, { ...place, open: attempt.id });
  const close = fromInsights ? insightsPath(courseId, attempt.activityId) : gradebookPath(courseId, place);
  const go = (id: string | null) => (id ? gradebookPath(courseId, { ...place, open: id }) : null);
  const error = q.attempt === attempt.id && typeof q.error === "string" ? SCORE_ERRORS[q.error] : undefined;
  const graded = result?.status === "graded" ? result : null;
  const scored = graded && {
    attemptId: attempt.id,
    name: attempt.studentName,
    aiScore: graded.score,
    teacherScore: graded.teacherScore,
    maxScore: graded.maxScore,
  };

  return (
    <>
      {/* The grid stays behind; clicking outside the panel closes it. */}
      <Link href={close} scroll={false} aria-label="Close" className="fixed inset-0 z-40 bg-black/25" />
      <aside
        aria-labelledby="panel-title"
        className="fixed inset-y-0 right-0 z-50 flex w-[min(44rem,100vw)] flex-col overflow-y-auto border-l border-border bg-bg shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-surface px-5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="panel-title" className="text-xl font-semibold break-words">
                {attempt.studentName}
              </h2>
              <p className="text-sm break-words text-muted">{attempt.activityTitle}</p>
            </div>
            <Link href={close} scroll={false} aria-label={fromInsights ? "Back to Insights" : "Close"} className="rounded-control p-1.5 text-muted hover:bg-subtle hover:text-text">
              <X size={20} aria-hidden />
            </Link>
          </div>
          {neighbors.of > 1 && (
            <nav aria-label="Other students on this assignment" className="flex items-center gap-3 text-sm">
              {go(neighbors.prev) ? (
                <Link href={go(neighbors.prev)!} scroll={false} className="font-medium text-accent-text hover:underline">
                  ↑ Previous student
                </Link>
              ) : (
                <span className="text-muted">↑ Previous student</span>
              )}
              <span className="text-muted tabular-nums">
                {neighbors.at + 1} of {neighbors.of} finished
              </span>
              {go(neighbors.next) ? (
                <Link href={go(neighbors.next)!} scroll={false} className="font-medium text-accent-text hover:underline">
                  Next student ↓
                </Link>
              ) : (
                <span className="text-muted">Next student ↓</span>
              )}
            </nav>
          )}
        </header>

        <div className="flex flex-col gap-5 px-5 py-4">
          <CanvasLine canvas={canvas} lastSent={lastSent} linked={linked} />

          <section id={attempt.id} className="flex scroll-mt-4 flex-col gap-3 rounded-panel border border-border bg-surface px-4 py-4" aria-labelledby="panel-grade">
            <h3 id="panel-grade" className="font-bold">
              Grade
            </h3>
            {!graded || !scored ? (
              <p className="text-muted">
                {result?.status === "failed" ? "Grading didn't finish." : attempt.status === "completed" ? "Being graded." : "Not graded yet: they haven't finished."}
              </p>
            ) : (
              <>
                {/* Keyed by attempt: Next/Previous re-renders the same panel, and without a key React keeps the
                    last student's typed score, note and answer in the boxes (Lucy's 7f546133). */}
                {dispute?.status === "open" ? (
                  <DisputeForm
                    key={attempt.id}
                    courseId={courseId}
                    from={here}
                    student={{ ...scored, disputeId: dispute.id, disputeReason: dispute.reason }}
                    error={error}
                  />
                ) : (
                  <ScoreForm
                    key={attempt.id}
                    courseId={courseId}
                    from={here}
                    student={scored}
                    saved={q.saved === attempt.id ? "Saved." : q.resolved === attempt.id ? "Dispute resolved. The student sees your answer." : null}
                    error={error}
                    note={{ value: graded.teacherNote }}
                  />
                )}
                {dispute?.status === "resolved" && (
                  <p className="text-sm text-muted">
                    They disputed it on <LocalTime value={dispute.openedAt} style="day" />: &ldquo;{dispute.reason}&rdquo;
                    {dispute.response && <> You answered: &ldquo;{dispute.response}&rdquo;</>}
                  </p>
                )}
                <p className="max-w-[65ch]">{graded.feedback}</p>
                <ResultBreakdown result={graded} raised="Points they raised" />
              </>
            )}
          </section>

          <section className="flex min-w-0 flex-col gap-3" aria-labelledby="panel-conversation">
            <h3 id="panel-conversation" className="font-bold">
              Conversation
            </h3>
            <p className="text-sm text-muted">
              Started <LocalTime value={attempt.startedAt} />
              {attempt.completedAt ? (
                <>
                  {" "}· Ended <LocalTime value={attempt.completedAt} />
                  {attempt.endedBy && `: ${ENDED[attempt.endedBy]}`}
                </>
              ) : (
                " · Still in progress"
              )}
            </p>
            {Transcript ? <Transcript attempt={attempt} /> : <p className="text-muted">This activity has no conversation to show.</p>}
          </section>
        </div>
      </aside>
    </>
  );
}

/** Where this grade stands with Canvas, in a sentence that can't be misread. */
function CanvasLine({ canvas, lastSent, linked }: { canvas: CanvasState; lastSent: number | null; linked: boolean }) {
  if (!linked) return <p className="rounded-control bg-subtle px-3 py-2 text-sm">This course isn&apos;t connected to Canvas, so this grade stays in DALAA.</p>;
  const style = {
    in_canvas: "border-success/40 bg-success/10 text-success",
    not_sent: "border-warn-text/30 bg-warn-soft text-warn-text",
    changed: "border-warn-text/30 bg-warn-soft text-warn-text",
    none: "border-border bg-subtle text-muted",
  }[canvas];
  const text = {
    in_canvas: `In Canvas: Canvas has this score (${lastSent === null ? "" : pts.format(lastSent)}).`,
    not_sent: "Not in Canvas yet. Use Send in this assignment's column when you're ready.",
    changed: `Changed since you sent it: Canvas still has ${lastSent === null ? "the old score" : pts.format(lastSent)}. Send again to update it.`,
    none: "Nothing to send to Canvas until it's graded.",
  }[canvas];
  return <p className={`rounded-control border px-3 py-2 text-sm font-medium ${style}`}>{text}</p>;
}
