/**
 * A response streamed as one JSON value per line (NDJSON), for every stream
 * DALAA sends: a chat turn, a practice run, a question about a class. Both
 * ends live here. No server imports: pages read with it.
 */

export const jsonLine = (event: unknown) => new TextEncoder().encode(`${JSON.stringify(event)}\n`);

export const ndjson = (body: ReadableStream<Uint8Array>) =>
  new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });

/** The JSON values in an NDJSON body, one per line, until it ends or drops. */
export async function* readJsonLines<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
        const text = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (text.trim() !== "") yield JSON.parse(text) as T;
      }
    }
    if (buffer.trim() !== "") yield JSON.parse(buffer) as T;
  } catch {
    // Dropped mid-line: the caller sees the events stop.
  }
}

