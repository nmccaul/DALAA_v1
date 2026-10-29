import type { ReactNode } from "react";

/**
 * A chat that had already ended when the page loaded: why it ended and the
 * grade come first, and the conversation is folded away for a student who
 * wants to look back at it.
 */
export function FinishedChat({
  ended,
  messages,
  result,
  conversation,
}: {
  ended: string;
  /** Messages the student sent. */
  messages: number;
  result: ReactNode;
  conversation: ReactNode;
}) {
  return (
    <>
      <p className="rounded-panel border border-border bg-surface px-4 py-3 font-medium">{ended}</p>
      {result}
      <details className="group rounded-panel border border-border bg-surface">
        <summary className="cursor-pointer list-none px-4 py-3 font-medium select-none">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
            ▸
          </span>
          See your conversation ({messages} {messages === 1 ? "message" : "messages"} from you)
        </summary>
        <div className="border-t border-border px-4 py-4">{conversation}</div>
      </details>
    </>
  );
}
