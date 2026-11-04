/**
 * The little Markdown chat models write anyway (**bold**, *italic*, `code`,
 * "## headings"), split into pieces a component renders as elements. Never
 * HTML: the text is the model's, so it's only ever rendered as text.
 */

export type Piece = { kind: "text" | "strong" | "em" | "code"; text: string };

// **bold** or __bold__; *italic* or _italic_ (not "3 * 4 * 5", not snake_case); `code`.
const INLINE = /\*\*(?=\S)(.+?)(?<=\S)\*\*|__(?=\S)(.+?)(?<=\S)__|(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])|(?<!\w)_(?=\S)(.+?)(?<=\S)_(?!\w)|`([^`\n]+)`/g;
const HEADING = /^#{1,6}\s+(.+?)\s*#*$/;

/** `text` as pieces, line breaks kept in the text pieces. A heading line becomes bold. */
export function inlinePieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  const push = (kind: Piece["kind"], value: string) => {
    if (value === "") return;
    const last = pieces.at(-1);
    if (kind === "text" && last?.kind === "text") last.text += value;
    else pieces.push({ kind, text: value });
  };
  text.split("\n").forEach((line, i) => {
    if (i > 0) push("text", "\n");
    const heading = HEADING.exec(line);
    if (heading) return push("strong", heading[1]);
    let at = 0;
    for (const m of line.matchAll(INLINE)) {
      push("text", line.slice(at, m.index));
      const [, bold, bold2, em, em2, code] = m;
      if (bold ?? bold2) push("strong", (bold ?? bold2)!);
      else if (em ?? em2) push("em", (em ?? em2)!);
      else push("code", code!);
      at = m.index + m[0].length;
    }
    push("text", line.slice(at));
  });
  return pieces;
}
