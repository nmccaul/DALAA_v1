import { Fragment } from "react";
import { inlinePieces } from "./inline-format";
import { readingBlocks } from "./reading-blocks";

/**
 * A reading as students see it: its Markdown as headings, lists and
 * emphasis (reading-blocks.ts), never as HTML. Server or client.
 */
export function ReadingText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`flex max-w-[70ch] flex-col gap-4 text-[1.0625rem] leading-relaxed break-words ${className}`}>
      {readingBlocks(text).map((b, i) =>
        b.kind === "heading" ? (
          b.level === 1 ? (
            <h3 key={i} className="mt-2 font-display text-2xl font-semibold text-balance">
              <Inline text={b.text} />
            </h3>
          ) : b.level === 2 ? (
            <h4 key={i} className="mt-2 font-display text-xl font-semibold text-balance">
              <Inline text={b.text} />
            </h4>
          ) : (
            <h5 key={i} className="mt-1 font-bold">
              <Inline text={b.text} />
            </h5>
          )
        ) : b.kind === "list" ? (
          b.ordered ? (
            <ol key={i} className="flex list-decimal flex-col gap-1 pl-6">
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} />
                </li>
              ))}
            </ol>
          ) : (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-6">
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          )
        ) : b.kind === "quote" ? (
          <blockquote key={i} className="border-l-4 border-border-strong pl-4 whitespace-pre-line text-muted">
            <Inline text={b.text} />
          </blockquote>
        ) : b.kind === "rule" ? (
          <hr key={i} className="border-border" />
        ) : (
          <p key={i} className="whitespace-pre-line">
            <Inline text={b.text} />
          </p>
        ),
      )}
    </div>
  );
}

/** Bold, italic and code inside a block (inline-format.ts). */
function Inline({ text }: { text: string }) {
  return inlinePieces(text).map((p, i) =>
    p.kind === "strong" ? (
      <strong key={i} className="font-semibold">
        {p.text}
      </strong>
    ) : p.kind === "em" ? (
      <em key={i}>{p.text}</em>
    ) : p.kind === "code" ? (
      <code key={i} className="rounded bg-subtle px-1 font-mono text-[0.9em]">
        {p.text}
      </code>
    ) : (
      <Fragment key={i}>{p.text}</Fragment>
    ),
  );
}
