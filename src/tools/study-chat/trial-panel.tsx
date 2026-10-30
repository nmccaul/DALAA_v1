"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { points, ResultBreakdown } from "@/results/breakdown";
import { totals } from "@/results/store";
import { trialAction, type TrialState } from "./actions";
import { Bubble } from "./chat-room";

/**
 * "Try it with a sample student" on the review screen: the teacher picks a
 * struggling or a strong student, and sees the conversation next to the grade
 * it would get. It uses the last saved settings; nothing reaches students or Canvas.
 */
export function TrialPanel({ activityId, persona }: { activityId: string; persona: string }) {
  const [state, action, pending] = useActionState<TrialState, FormData>(trialAction, {});
  const { trial } = state;

  return (
    <details className="group rounded-panel border border-border bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 font-medium select-none">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
          ▸
        </span>
        Try it with a sample student
      </summary>
      <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
        <p className="max-w-[65ch] text-sm text-muted">
          An AI plays a student and has the whole chat, then the real grader grades it. It uses your last saved
          changes. Students never see it, and nothing goes to Canvas.
        </p>
        <form action={action} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="activityId" value={activityId} />
          <fieldset className="flex flex-wrap gap-4">
            <legend className="mb-2 text-sm font-medium">Which student?</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="level" value="struggling" defaultChecked /> Struggling
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="level" value="strong" /> Strong
            </label>
          </fieldset>
          <Button variant="secondary" disabled={pending}>
            {pending ? "Running…" : trial ? "Run another" : "Run it"}
          </Button>
        </form>
        {pending && (
          <p role="status" className="text-sm text-muted">
            The sample student is chatting, then it&apos;s graded. This takes a minute or two.
          </p>
        )}
        {!pending && state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {!pending && trial && (
          <div className="flex flex-col gap-4">
            <p className="font-medium">{trial.ending}</p>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section aria-label="Sample conversation" className="flex min-w-0 flex-col gap-3">
                {trial.work && (
                  <details className="rounded-control border border-border px-3 py-2 text-sm">
                    <summary className="cursor-pointer font-medium">The work the sample student brought</summary>
                    <p className="mt-2 whitespace-pre-wrap break-words">{trial.work.body}</p>
                  </details>
                )}
                <Bubble from={persona} text={trial.opening} />
                {trial.turns.map((t, i) => (
                  <div key={i} className="flex flex-col gap-3">
                    <Bubble mine from="Sample student" text={t.message} />
                    <Bubble from={persona} text={t.reply} />
                  </div>
                ))}
              </section>
              <section aria-label="Sample grade" className="flex min-w-0 flex-col gap-4">
                {trial.grade ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-display text-xl font-semibold">
                        Grade: {totals(trial.grade).score.toLocaleString("en-US", { maximumFractionDigits: 2 })} of{" "}
                        {points(totals(trial.grade).maxScore)}
                      </h3>
                      <p className="max-w-[65ch]">{trial.grade.feedback}</p>
                      {trial.grade.position && <p className="text-sm text-muted">Position taken: {trial.grade.position}</p>}
                    </div>
                    <ResultBreakdown result={trial.grade} raised="Points raised" />
                  </>
                ) : (
                  <p className="text-muted">The grader&apos;s answer didn&apos;t fit the rubric, so there&apos;s no grade. Run it again.</p>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
