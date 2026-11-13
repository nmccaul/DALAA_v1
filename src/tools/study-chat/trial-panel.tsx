"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { points, ResultBreakdown } from "@/results/breakdown";
import { totals } from "@/results/store";
import { trialAction, type TrialState } from "./actions";
import { Bubble } from "./chat-room";

/**
 * "Try it as a student", on the review screen and wizard step 7: two ways side
 * by side. A practice run, where an AI plays a struggling or a strong student
 * and the real grader scores the chat (nothing is saved, nothing reaches
 * Canvas). Or the teacher takes it themselves in Canvas's Student View, which
 * DALAA can't switch on for them (Canvas only accepts that from its own page),
 * so it links to the course's Settings, where the Student View button is.
 */
export function TrialPanel({
  activityId,
  persona,
  title,
  assigned,
  canvasCourseUrl,
}: {
  activityId: string;
  persona: string;
  title: string;
  assigned: boolean;
  canvasCourseUrl: string | null;
}) {
  const [state, action, pending] = useActionState<TrialState, FormData>(trialAction, {});
  const { trial } = state;

  return (
    <section aria-labelledby="try-heading" className="flex flex-col gap-4">
      <h4 id="try-heading" className="font-display text-lg font-semibold">
        Try it as a student
      </h4>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3 rounded-panel border border-border bg-surface px-4 py-4">
          <h5 className="font-medium">Practice run with an AI student</h5>
          <p className="text-sm text-muted">
            An AI plays a student from start to finish, then the grader scores the chat, so you can see how it goes
            and how it&apos;s graded. Takes a minute or two. It uses your last saved changes; nothing is saved or sent
            to Canvas.
          </p>
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="activityId" value={activityId} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Which student?</legend>
              <label className="flex items-start gap-2">
                <input type="radio" name="level" value="struggling" defaultChecked className="mt-1" />
                <span>
                  Struggling <span className="text-sm text-muted">skimmed the reading, short answers, needs prompting</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="level" value="strong" className="mt-1" />
                <span>
                  Strong <span className="text-sm text-muted">read closely, uses the facts, backs things up</span>
                </span>
              </label>
            </fieldset>
            <div>
              <Button variant="secondary" disabled={pending}>
                {pending ? "Running…" : trial ? "Run another" : "Start practice run"}
              </Button>
            </div>
          </form>
        </div>
        <div className="flex min-w-0 flex-col gap-3 rounded-panel border border-border bg-surface px-4 py-4">
          <h5 className="font-medium">Try it yourself</h5>
          <TryItYourself title={title} assigned={assigned} canvasCourseUrl={canvasCourseUrl} />
        </div>
      </div>
        {pending && (
          <p role="status" className="text-sm text-muted">
            The AI student is chatting, then the grader scores it. This takes a minute or two.
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
    </section>
  );
}

/** How to take it in Canvas's Student View, for where the activity is. Exported for tests. */
export function TryItYourself({ title, assigned, canvasCourseUrl }: { title: string; assigned: boolean; canvasCourseUrl: string | null }) {
  if (canvasCourseUrl === null) {
    return (
      <p className="text-sm text-muted">
        Taking it yourself uses Canvas&apos;s Student View, and this course isn&apos;t in Canvas. Use a practice run
        instead.
      </p>
    );
  }
  if (!assigned) {
    return (
      <p className="text-sm text-muted">
        Assign it first. Once it&apos;s in Canvas Assignments, come back here to open Canvas&apos;s Student View and
        take it the way your students will.
      </p>
    );
  }
  return (
    <>
      <p className="text-sm text-muted">Take it the way your students will, with Canvas&apos;s Student View:</p>
      {/* Student View starts from Assignments or the course home, not from Settings (feedback 3ecc5d28). */}
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
        <li>
          In Canvas, go to <b>Assignments</b> and click <b>Student View</b> at the top right.
        </li>
        <li>Open &ldquo;{title}&rdquo; and take it.</li>
        <li>When you&apos;re done, click <b>Leave Student View</b> at the bottom of Canvas.</li>
      </ol>
      <p className="text-sm text-muted">Your attempt counts as Canvas&apos;s Test Student and shows on the Results tab.</p>
      <a
        href={`${canvasCourseUrl}/assignments`}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start font-medium text-accent-text underline"
      >
        Open Assignments in Canvas ↗
      </a>
    </>
  );
}
