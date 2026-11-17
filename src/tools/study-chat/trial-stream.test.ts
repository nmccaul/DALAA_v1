import { describe, expect, it } from "vitest";
import { draft } from "./test-fixtures";
import type { Trial, TrialOutcome, TrialStep } from "./trial";
import { readTrialEvents, trialResponse, TRIAL_CUT_OFF, type TrialEvent } from "./trial-stream";

const trial: Trial = { opening: draft().scenarios[0].opening, work: null, turns: [{ message: "Hi", reply: "Hello" }], endedBy: "turns", grade: null };

async function events(body: ReadableStream<Uint8Array>): Promise<TrialEvent[]> {
  const all: TrialEvent[] = [];
  for await (const event of readTrialEvents(body)) all.push(event);
  return all;
}

const respond = (steps: TrialStep[], outcome: TrialOutcome) =>
  trialResponse(async (send) => {
    for (const step of steps) send(step);
    return outcome;
  }, () => "Ended.");

describe("trialResponse + readTrialEvents", () => {
  it("streams each step, then the trial with why it ended", async () => {
    const steps: TrialStep[] = [{ type: "start", opening: trial.opening }, { type: "turn", turn: trial.turns[0] }, { type: "grading" }];
    expect(await events(respond(steps, { ok: true, trial }).body!)).toEqual([...steps, { type: "done", trial: { ...trial, ending: "Ended." } }]);
  });

  it("ends with the reason when the run fails", async () => {
    expect(await events(respond([], { ok: false, reason: "Busy." }).body!)).toEqual([{ type: "failed", reason: "Busy." }]);
  });

  it("says the run was cut off when the events stop before the end, keeping what came", async () => {
    const cut = `${JSON.stringify({ type: "turn", turn: trial.turns[0] })}\n{"type":"tu`;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(cut));
        c.close();
      },
    });
    expect(await events(body)).toEqual([
      { type: "turn", turn: trial.turns[0] },
      { type: "failed", reason: TRIAL_CUT_OFF },
    ]);
  });
});
