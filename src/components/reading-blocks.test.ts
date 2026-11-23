import { describe, expect, it } from "vitest";
import { readingBlocks } from "./reading-blocks";

describe("readingBlocks", () => {
  it("turns Markdown into headings, lists, quotes and rules (feedback ffcdcaf9)", () => {
    const text = "# Harbor Bikes\n\nThe owner must decide.\nSoon.\n\n## Options\n- Open now\n- Wait\n  until spring\n\n1. Cash\n2) Staff\n\n> Winter is slow.\n> Very slow.\n\n---\n#### Small";
    expect(readingBlocks(text)).toEqual([
      { kind: "heading", level: 1, text: "Harbor Bikes" },
      { kind: "paragraph", text: "The owner must decide.\nSoon." },
      { kind: "heading", level: 2, text: "Options" },
      { kind: "list", ordered: false, items: ["Open now", "Wait until spring"] },
      { kind: "list", ordered: true, items: ["Cash", "Staff"] },
      { kind: "quote", text: "Winter is slow.\nVery slow." },
      { kind: "rule" },
      { kind: "heading", level: 3, text: "Small" },
    ]);
  });

  it("leaves plain text as paragraphs with its line breaks", () => {
    expect(readingBlocks("Line one\r\nline two\n\n\nNext")).toEqual([
      { kind: "paragraph", text: "Line one\nline two" },
      { kind: "paragraph", text: "Next" },
    ]);
    expect(readingBlocks("#hashtag and 3 * 4")).toEqual([{ kind: "paragraph", text: "#hashtag and 3 * 4" }]);
    expect(readingBlocks("")).toEqual([]);
  });
});
