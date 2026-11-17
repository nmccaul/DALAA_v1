/**
 * How an answer about the class travels to the teacher's page: one JSON event
 * per line. `labels` first (S1… to attempts, for links), then the answer as
 * `text` while it's written, then `done` or `failed`. Both ends live here.
 * No server imports: the page reads with it.
 */

import { jsonLine, ndjson, readJsonLines } from "@/lib/ndjson";

export type AskEvent =
  | { type: "labels"; labels: Record<string, string> }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "failed"; reason: string };

/** What the page says when the answer stops before its end. */
export const ASK_CUT_OFF = "The answer stopped before it finished. Ask again.";

/** Streams an answer; `failed` words a failed call. `settled` resolves once it's over, so the route can wait for the ledger. */
export function askResponse(
  started: { labels: Record<string, string>; textStream: AsyncIterable<string>; done: Promise<string> },
  failed: string,
): { response: Response; settled: Promise<void> } {
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
  const send = (event: AskEvent) => {
    if (!open) return;
    try {
      controller.enqueue(jsonLine(event));
    } catch {
      open = false;
    }
  };
  const settled = (async () => {
    send({ type: "labels", labels: started.labels });
    try {
      for await (const text of started.textStream) send({ type: "text", text });
      await started.done;
      send({ type: "done" });
    } catch (error) {
      console.error("insights question failed:", error instanceof Error ? error.message : error);
      send({ type: "failed", reason: failed });
    }
    if (open) controller.close();
  })();
  return { response: ndjson(body), settled };
}

/** The events in an answer's body; one that stops early ends with `failed`. */
export async function* readAskEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AskEvent> {
  let finished = false;
  for await (const event of readJsonLines<AskEvent>(body)) {
    if (event.type === "done" || event.type === "failed") finished = true;
    yield event;
  }
  if (!finished) yield { type: "failed", reason: ASK_CUT_OFF };
}
