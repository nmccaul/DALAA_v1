/**
 * A reading's Markdown as blocks a component renders as elements (feedback
 * ffcdcaf9: "# Title" in pasted text should show as a title). Headings,
 * paragraphs, bulleted and numbered lists, quotes and rules; emphasis inside
 * them is inline-format.ts's. Never HTML: the text is whatever was pasted,
 * uploaded or fetched, so it's only ever rendered as text. Text without
 * Markdown comes out as paragraphs, its line breaks kept.
 */

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" };

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const NUMBERED = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

export function readingBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    const last = blocks.at(-1);
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", level: Math.min(heading[1].length, 3) as 1 | 2 | 3, text: heading[2] });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = numbered !== null;
      const item = (bullet ?? numbered)![1];
      if (last?.kind === "list" && last.ordered === ordered && blocks.at(-1) === last) last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote) {
      flush();
      if (last?.kind === "quote") last.text += `\n${quote[1]}`;
      else blocks.push({ kind: "quote", text: quote[1] });
      continue;
    }
    // A line right under a list item continues it; anything else starts or continues a paragraph.
    if (paragraph.length === 0 && last?.kind === "list" && /^\s+\S/.test(line)) {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}
