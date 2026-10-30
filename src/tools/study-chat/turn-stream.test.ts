import { describe, expect, it } from "vitest";
import type { Attempt } from "@/attempts/store";
import type { SendResult, TurnOutcome } from "./chat";
import { REPLY_FAILED } from "./student-messages";
import { readTurnEvents, turnResponse, type TurnEvent } from "./turn-stream";

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  id: "a",
  activityId: "b",
  status: "in_progress",
  endedBy: null,
  startedAt: new Date(),
  completedAt: null,
  ...over,
});

async function* chunks(...parts: string[]) {
  for (const part of parts) yield part;
}

const streamed = (parts: string[], outcome: TurnOutcome): SendResult => ({
  kind: "stream",
  textStream: chunks(...parts),
  done: Promise.resolve(outcome),
});

async function events(response: Response): Promise<TurnEvent[]> {
  const all: TurnEvent[] = [];
  for await (const event of readTurnEvents(response.body!)) all.push(event);
  return all;
}

const bodyOf = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });

describe("turnResponse + readTurnEvents", () => {
  it("streams the reply as it's written, then the saved reply", async () => {
    const { response, settled } = turnResponse(streamed(["Hel", "lo"], { ok: true, reply: "Hello", attempt: attempt(), progress: null }));
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(await events(response)).toEqual([
      { type: "text", text: "Hel" },
      { type: "text", text: "lo" },
      { type: "reply", reply: "Hello", ended: null, progress: null },
    ]);
    await settled;
  });

  it("says why the chat ended when this turn ended it", async () => {
    const { response } = turnResponse(
      streamed(["Bye"], { ok: true, reply: "Bye", attempt: attempt({ status: "completed", endedBy: "turns", completedAt: new Date() }), progress: null }),
    );
    expect((await events(response)).at(-1)).toEqual({
      type: "reply",
      reply: "Bye",
      ended: "This chat has ended: you've used all your messages.",
      progress: null,
    });
  });

  it("carries the progress meter with the saved reply", async () => {
    const progress = { points: { covered: 1, total: 3 }, position: "Wait" };
    const { response } = turnResponse(streamed(["Ok"], { ok: true, reply: "Ok", attempt: attempt(), progress }));
    expect((await events(response)).at(-1)).toEqual({ type: "reply", reply: "Ok", ended: null, progress });
  });

  it("ends a failed reply with `failed`", async () => {
    const { response } = turnResponse(streamed(["Par"], { ok: false, reason: REPLY_FAILED }));
    expect((await events(response)).at(-1)).toEqual({ type: "failed", reason: REPLY_FAILED });
  });

  it("answers a replay with the saved reply alone", async () => {
    const { response } = turnResponse({ kind: "replay", reply: "Saved", attempt: attempt(), progress: null });
    expect(await events(response)).toEqual([{ type: "reply", reply: "Saved", ended: null, progress: null }]);
  });

  it("answers a refusal with a 400 and the reason", async () => {
    const { response } = turnResponse({ kind: "refused", reason: "Write a message first." });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ reason: "Write a message first." });
  });

  it("still saves the turn when the browser stops listening", async () => {
    let saved = false;
    const done = (async (): Promise<TurnOutcome> => {
      await new Promise((r) => setTimeout(r, 5));
      saved = true;
      return { ok: true, reply: "Hello", attempt: attempt(), progress: null };
    })();
    const { response, settled } = turnResponse({ kind: "stream", textStream: chunks("Hel", "lo"), done });
    await response.body!.cancel();
    await settled;
    expect(saved).toBe(true);
  });

  it("reports a body cut off before its last event as failed", async () => {
    const cut = `${JSON.stringify({ type: "text", text: "Hel" })}\n{"type":"te`;
    const all: TurnEvent[] = [];
    for await (const event of readTurnEvents(bodyOf(cut))) all.push(event);
    expect(all).toEqual([
      { type: "text", text: "Hel" },
      { type: "failed", reason: REPLY_FAILED },
    ]);
  });
});
