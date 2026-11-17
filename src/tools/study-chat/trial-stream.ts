/**
 * How a practice run travels to the teacher's browser (feedback 21b68dd3):
 * one JSON event per line, each step as it happens (trial.ts `TrialStep`),
 * then `done` with the grade or `failed` with why. Both ends live here so
 * they can't drift. No server imports: the review screen reads with it.
 */

import type { Trial, TrialOutcome, TrialStep } from "./trial";
import { jsonLine, ndjson, readJsonLines } from "./turn-stream";

export type TrialEvent = TrialStep | { type: "done"; trial: Trial & { ending: string } } | { type: "failed"; reason: string };

/** What the page says when the run's events stop before its end: the server was cut off or the connection dropped. */
export const TRIAL_CUT_OFF = "The practice run stopped before it finished. The conversation so far is below; try again.";

/**
 * Streams a run: `run` gets `send` for its steps and returns the outcome,
 * which becomes the last event. `ending` words why it stopped.
 */
export function trialResponse(run: (send: (step: TrialStep) => void) => Promise<TrialOutcome>, ending: (trial: Trial) => string): Response {
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TrialEvent) => {
        if (!open) return;
        try {
          controller.enqueue(jsonLine(event));
        } catch {
          open = false;
        }
      };
      const outcome = await run(send);
      send(outcome.ok ? { type: "done", trial: { ...outcome.trial, ending: ending(outcome.trial) } } : { type: "failed", reason: outcome.reason });
      if (open) controller.close();
    },
    cancel() {
      open = false;
    },
  });
  return ndjson(body);
}

/** The events in a run's body; one that stops early ends with `failed`. */
export async function* readTrialEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<TrialEvent> {
  let finished = false;
  for await (const event of readJsonLines<TrialEvent>(body)) {
    if (event.type === "done" || event.type === "failed") finished = true;
    yield event;
  }
  if (!finished) yield { type: "failed", reason: TRIAL_CUT_OFF };
}
