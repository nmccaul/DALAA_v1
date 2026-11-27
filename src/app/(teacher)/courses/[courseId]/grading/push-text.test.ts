import { describe, expect, it } from "vitest";
import { readSummary, summaryLines, summaryQuery } from "./push-text";

describe("push summary text", () => {
  it("round-trips a summary through the Grading tab's query", () => {
    const summary = { sent: 3, failed: 1, skipped: { unchanged: 2, not_in_canvas: 1 }, why: "rejected" as const };
    const q = Object.fromEntries(summaryQuery("a1", summary));
    expect(q.pushed).toBe("a1");
    expect(readSummary(q)).toEqual(summary);
  });

  it("ignores made-up or broken counts", () => {
    expect(readSummary({ sent: "-2", failed: "x", skip_unchanged: "1.5", skip_bogus: "4", why: "bogus" })).toEqual({ sent: 0, failed: 0, skipped: {} });
  });

  it("says what was sent, what failed and why the rest weren't", () => {
    expect(summaryLines({ sent: 1, failed: 2, skipped: { not_graded: 1, lowered: 3 } })).toEqual([
      "Sent 1 grade to Canvas.",
      "Canvas didn't take 2 grades. Canvas didn't answer. Nothing was recorded as sent; try again in a minute.",
      "Lower than the grade in Canvas: 3 students.",
      "Not graded yet: 1 student.",
    ]);
    expect(summaryLines({ sent: 0, failed: 0, skipped: { unchanged: 4 } })).toEqual([
      "No new grades to send.",
      "Already in Canvas: 4 students.",
    ]);
    // Nothing sent and some refused: no "No new grades to send" (feedback 3ad0e5ab), and why.
    expect(summaryLines({ sent: 0, failed: 3, skipped: {}, why: "forbidden" })).toEqual([
      "Canvas didn't take 3 grades. Canvas didn't let DALAA send grades to this course. Check that DALAA is still installed in the course, then try again.",
    ]);
  });
});
