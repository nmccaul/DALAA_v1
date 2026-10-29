/**
 * How one chat turn travels from the server to the student's browser: one
 * JSON event per line. `text` events carry the reply as it's written; the
 * last event is `reply` (saved, with why the chat ended, if it did) or
 * `failed` (nothing counted; send again with the same key). Both ends live
 * here so they can't drift. No server imports: the chat page reads with it.
 */

import type { SendResult } from "./chat";
import { ENDED, REPLY_FAILED } from "./student-messages";

export type TurnEvent =
  | { type: "text"; text: string }
  /** `ended`: why the chat is over now; NULL while it goes on. */
  | { type: "reply"; reply: string; ended: string | null }
  | { type: "failed"; reason: string };

type Ending = { status: "in_progress" | "completed"; endedBy: keyof typeof ENDED | null };

const endedReason = (attempt: Ending) => (attempt.status === "completed" && attempt.endedBy ? ENDED[attempt.endedBy] : null);

const line = (event: TurnEvent) => new TextEncoder().encode(`${JSON.stringify(event)}\n`);

const ndjson = (body: ReadableStream<Uint8Array>) =>
  new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });

/**
 * The response for a `sendTurn` result. `settled` resolves once the reply is
 * saved or has failed; the route keeps the function alive until then, so a
 * student who closes the tab mid-reply still gets the turn they paid for.
 */
export function turnResponse(result: SendResult): { response: Response; settled: Promise<void> } {
  if (result.kind === "refused") {
    return { response: Response.json({ reason: result.reason }, { status: 400 }), settled: Promise.resolve() };
  }
  if (result.kind === "replay") {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(line({ type: "reply", reply: result.reply, ended: endedReason(result.attempt) }));
        controller.close();
      },
    });
    return { response: ndjson(body), settled: Promise.resolve() };
  }

  // The reply is read to the end whether or not the browser is still
  // listening: the turn is saved only once the whole reply is in.
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      open = false;
    },
  });
  const send = (event: TurnEvent) => {
    if (!open) return;
    try {
      controller.enqueue(line(event));
    } catch {
      open = false;
    }
  };
  const settled = (async () => {
    try {
      for await (const text of result.textStream) send({ type: "text", text });
    } catch {
      // A failed call reports itself through `done`.
    }
    const outcome = await result.done;
    send(outcome.ok ? { type: "reply", reply: outcome.reply, ended: endedReason(outcome.attempt) } : { type: "failed", reason: outcome.reason });
    if (open) controller.close();
  })();
  return { response: ndjson(body), settled };
}

/**
 * The events in a turn response's body. A body that stops before its last
 * event (a dropped connection) ends with `failed`, so the page always offers
 * to send again.
 */
export async function* readTurnEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<TurnEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const parse = (text: string): TurnEvent | null => {
    if (text.trim() === "") return null;
    const event = JSON.parse(text) as TurnEvent;
    if (event.type !== "text") finished = true;
    return event;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
        const event = parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (event) yield event;
      }
    }
    const last = parse(buffer);
    if (last) yield last;
  } catch {
    // Dropped mid-reply: reported below.
  }
  if (!finished) yield { type: "failed", reason: REPLY_FAILED };
}
