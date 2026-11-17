"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { points, ResultBreakdown } from "@/results/breakdown";
import { totals } from "@/results/store";
import { Bubble } from "./chat-room";
import type { Exchange } from "./prompt";
import type { Trial } from "./trial";
import { readTrialEvents } from "./trial-stream";

/** A practice run as the page knows it so far: filled in step by step as the events arrive. */
type Run = {
  opening: string | null;
  work: Trial["work"];
  turns: Exchange[];
  grading: boolean;
  /** Set once it's done. */
  trial: (Trial & { ending: string }) | null;
  error: string | null;
};

const EMPTY_RUN: Run = { opening: null, work: null, turns: [], grading: false, trial: null, error: null };

/**
 * "Try it as a student", on the review screen and wizard step 7: two ways side
 * by side. A practice run, where an AI plays a struggling or a strong student
 * and the real grader scores the chat (nothing is saved, nothing reaches
 * Canvas). Or the teacher takes it themselves in Canvas's Student View, which
 * DALAA can't switch on for them (Canvas only accepts that from its own page),
 * so it links to the course's Settings, where the Student View button is.
 *
 * The practice run streams (feedback 21b68dd3): each exchange shows as it
 * happens, then "Grading…", then the grade. Leaving the page stops it.
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
  const [run, setRun] = useState<Run | null>(null);
  const [pending, setPending] = useState(false);
  const stop = useRef<AbortController | null>(null);
  const shown = useRef<HTMLDivElement>(null);
  useEffect(() => () => stop.current?.abort(), []);
  const trial = run?.trial ?? null;
  // The conversation starts below the form: bring it into view once, as it starts.
  const started = run?.opening != null;
  useEffect(() => {
    if (started) shown.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [started]);

  async function start(level: string) {
    stop.current?.abort();
    const controller = new AbortController();
    stop.current = controller;
    setPending(true);
    setRun(EMPTY_RUN);
    const update = (change: (r: Run) => Run) => setRun((r) => change(r ?? EMPTY_RUN));
    try {
      const res = await fetch(`/api/study-chat/${activityId}/trial`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const { reason } = (await res.json().catch(() => ({}))) as { reason?: string };
        update((r) => ({ ...r, error: reason ?? "The practice run didn't start. Try again." }));
        return;
      }
      for await (const event of readTrialEvents(res.body)) {
        if (event.type === "start") update((r) => ({ ...r, opening: event.opening }));
        else if (event.type === "work") update((r) => ({ ...r, work: event.work }));
        else if (event.type === "turn") update((r) => ({ ...r, turns: [...r.turns, event.turn] }));
        else if (event.type === "grading") update((r) => ({ ...r, grading: true }));
        else if (event.type === "done") update((r) => ({ ...r, trial: event.trial, grading: false }));
        else update((r) => ({ ...r, error: event.reason, grading: false }));
      }
    } catch {
      if (!controller.signal.aborted) update((r) => ({ ...r, error: "The practice run didn't start. Try again." }));
    } finally {
      if (stop.current === controller) setPending(false);
    }
  }

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
            and how it&apos;s graded. You watch it as it goes; it takes a minute or two. It uses your last saved changes; nothing is saved or sent
            to Canvas.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void start(String(new FormData(e.currentTarget).get("level") ?? ""));
            }}
            className="flex flex-col gap-3"
          >
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
              <Button type="submit" variant="secondary" disabled={pending}>
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
      {run?.error && (
        <p role="alert" className="text-sm text-danger">
          {run.error}
        </p>
      )}
      {run && (run.opening !== null || run.trial) && (
        <div ref={shown} className="flex scroll-mt-4 flex-col gap-4">
          <p role="status" className={trial ? "font-medium" : "text-sm text-muted"}>
            {trial
              ? trial.ending
              : pending
                ? run.grading
                  ? "The conversation is done. Grading it…"
                  : `The AI student is chatting: ${run.turns.length} ${run.turns.length === 1 ? "message" : "messages"} so far.`
                : null}
          </p>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section aria-label="Sample conversation" className="flex min-w-0 flex-col gap-3">
              {run.work && (
                <details className="rounded-control border border-border px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium">The work the sample student brought</summary>
                  <p className="mt-2 whitespace-pre-wrap break-words">{run.work.body}</p>
                </details>
              )}
              {run.opening !== null && <Bubble from={persona} text={run.opening} />}
              {run.turns.map((t, i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Bubble mine from="Sample student" text={t.message} />
                  <Bubble from={persona} text={t.reply} />
                </div>
              ))}
              {pending && !run.grading && <p className="text-sm text-muted">Writing the next message…</p>}
            </section>
            <section aria-label="Sample grade" className="flex min-w-0 flex-col gap-4">
              {trial ? (
                trial.grade ? (
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
                )
              ) : (
                pending && <p className="text-sm text-muted">The grade shows here when the conversation ends.</p>
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
