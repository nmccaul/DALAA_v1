import { describe, expect, it } from "vitest";
import { reflowPage, type PdfLine } from "./pdf";

/** Lines 14pt apart from the top, starting at x=72; `end` is where each line's text stops. */
function lines(rows: [string, number, { y?: number; x?: number; size?: number }?][]): PdfLine[] {
  let y = 720;
  return rows.map(([text, end, at = {}]) => {
    y = at.y ?? y - 14;
    return { text, x: at.x ?? 72, end, y, size: at.size ?? 12 };
  });
}

describe("reflowPage", () => {
  it("joins lines that run on, so a narrow reading column doesn't leave one-word stubs (feedback 83088215)", () => {
    const page = lines([
      ["Sales fell twenty percent last year as the company lost its", 540],
      ["biggest retail partner and failed to replace it with online", 536],
      ["sales.", 110],
    ]);
    expect(reflowPage(page)).toBe(
      "Sales fell twenty percent last year as the company lost its biggest retail partner and failed to replace it with online sales.",
    );
  });

  it("ends a paragraph at a short line or a wider gap, and keeps headings and list items on their own lines", () => {
    const page = lines([
      ["Harbor Bikes", 200, { y: 740, size: 18 }],
      ["The board met in March to decide what to do about the", 540],
      ["problem.", 120],
      ["Three options were on the table:", 300],
      ["• close the downtown store and move the stock online, which", 540],
      ["would cut rent in half;", 250],
      ["• keep it open.", 200],
      ["Nobody liked either option and the meeting ran very late into", 540, { y: 600 }],
      ["the night.", 130],
    ]);
    expect(reflowPage(page)).toBe(
      [
        "Harbor Bikes",
        "The board met in March to decide what to do about the problem.",
        "Three options were on the table:",
        "• close the downtown store and move the stock online, which would cut rent in half;",
        "• keep it open.",
        "",
        "Nobody liked either option and the meeting ran very late into the night.",
      ].join("\n"),
    );
  });

  it("rejoins a word hyphenated across lines, and starts an indented line fresh", () => {
    const page = lines([
      ["Managers acted out of self-", 540],
      ["interest, not malice, and the staff knew it from the very first", 540],
      ["Then the bank called.", 540, { x: 90 }],
    ]);
    expect(reflowPage(page)).toBe(
      "Managers acted out of self-interest, not malice, and the staff knew it from the very first\nThen the bank called.",
    );
  });

  it("is empty for a page with no text", () => {
    expect(reflowPage([])).toBe("");
    expect(reflowPage(lines([["  ", 72]]))).toBe("");
  });
});
