/**
 * Text from a PDF, rejoined into paragraphs. A PDF stores each printed line
 * on its own, so its raw text has a hard break every ~90 characters; shown in
 * a narrower reading column, every line wraps and leaves a one- or two-word
 * stub (feedback 83088215). We use where each line sits on the page to tell a
 * line that runs on from one that ends a paragraph.
 *
 * Pure: no database, no network. Returns null for a file pdf.js can't open.
 */

import { getDocumentProxy } from "unpdf";

/** One printed line: its text, left and right edges, baseline and font size, in PDF points. */
export type PdfLine = { text: string; x: number; end: number; y: number; size: number };

/** A line that ends this far (as a share of the text width) short of the right edge ends its paragraph. */
const SHORT_LINE = 0.15;
/** A gap this many times the usual line spacing starts a new paragraph. */
const PARAGRAPH_GAP = 1.3;
/** A line that starts like a list item is never joined to the line above. */
const LIST_ITEM = /^\s*([•●▪◦‣∙·*–—-]|\(?\d{1,3}[.)]|\(?[a-z][.)])\s/i;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** One page's lines, top to bottom, as paragraphs: runs joined with a space, paragraphs split by a blank line. */
export function reflowPage(lines: PdfLine[]): string {
  const kept = lines.filter((l) => l.text.trim());
  if (kept.length === 0) return "";
  const left = Math.min(...kept.map((l) => l.x));
  const right = Math.max(...kept.map((l) => l.end));
  const fullFrom = right - SHORT_LINE * (right - left);
  const steps = kept.slice(1).map((l, i) => kept[i].y - l.y).filter((d) => d > 0);
  const spacing = steps.length ? median(steps) : kept[0].size * 1.2;

  let out = kept[0].text.trim();
  for (let i = 1; i < kept.length; i++) {
    const prev = kept[i - 1];
    const line = kept[i];
    const text = line.text.trim();
    const step = prev.y - line.y;
    if (step <= 0 || step > spacing * PARAGRAPH_GAP) {
      out += `\n\n${text}`; // a gap, or a jump back up the page (a new column)
    } else if (
      prev.end < fullFrom ||
      LIST_ITEM.test(text) ||
      line.x > prev.x + line.size || // an indented first line
      Math.abs(line.size - prev.size) > 1 // a heading
    ) {
      out += `\n${text}`;
    } else {
      out += /\p{L}-$/u.test(out) ? text : ` ${text}`; // "self-" + "interest"
    }
  }
  return out;
}

/** pdf.js text items gathered into printed lines (an item marked end-of-line closes one). */
function pageLines(items: unknown[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let open: PdfLine | null = null;
  for (const item of items) {
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    const { str, transform, width, height, hasEOL } = item as {
      str: string;
      transform: number[];
      width: number;
      height: number;
      hasEOL: boolean;
    };
    const [, , , , x, y] = transform;
    if (str) {
      if (!open) {
        open = { text: str, x, end: x + width, y, size: height };
        lines.push(open);
      } else {
        open.text += str;
        open.x = Math.min(open.x, x);
        open.end = Math.max(open.end, x + width);
        open.size = Math.max(open.size, height);
      }
    }
    if (hasEOL) open = null;
  }
  return lines;
}

export async function pdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    // pdf.js takes ownership of the buffer it's given; hand it a copy.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      pages.push(reflowPage(pageLines((await page.getTextContent()).items)));
    }
    return pages.join("\n\n");
  } catch {
    return null;
  }
}
