import { describe, expect, it } from "vitest";
import { OLD_TEST_STUDENT, onlyTestStudentsRefused, readSummary, summaryLines, summaryQuery } from "./push-text";

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
      "Students not graded yet are skipped. Each graded student is sent on their own, so they don't hold back the others.",
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

  it("names who Canvas didn't take, and says an old Student View test student needs nothing (feedback 1b203924)", () => {
    const summary = { sent: 0, failed: 1, skipped: { unchanged: 1, not_graded: 12 }, why: "rejected" as const };
    expect(summaryLines(summary, [{ name: "Test Student", studentView: true, why: "rejected" }])).toEqual([
      `Canvas didn't take 1 grade: Test Student (Student View). ${OLD_TEST_STUDENT}`,
      "Already in Canvas: 1 student.",
      "Not graded yet: 12 students.",
      "Students not graded yet are skipped. Each graded student is sent on their own, so they don't hold back the others.",
    ]);
    expect(onlyTestStudentsRefused(summary, [{ name: "Test Student", studentView: true, why: "rejected" }])).toBe(true);
    expect(onlyTestStudentsRefused(summary, [])).toBe(false);
    // A real student among them: the usual reason, with names.
    const two = { sent: 0, failed: 2, skipped: {}, why: "rejected" as const };
    expect(
      summaryLines(two, [
        { name: "Ana", studentView: false, why: "rejected" },
        { name: "Test Student", studentView: true, why: "rejected" },
      ])[0],
    ).toMatch(/^Canvas didn't take 2 grades: Ana, Test Student \(Student View\)\. Canvas turned them down/);
    // Names that don't match the count (an older push, say) aren't shown.
    expect(summaryLines(two, [{ name: "Ana", studentView: false, why: "rejected" }])[0]).toMatch(/^Canvas didn't take 2 grades\. Canvas turned/);
    // Many: the first five, then a count.
    const many = Array.from({ length: 7 }, (_, i) => ({ name: `S${i}`, studentView: false, why: null }));
    expect(summaryLines({ sent: 0, failed: 7, skipped: {} }, many)[0]).toMatch(/: S0, S1, S2, S3, S4 and 2 more\./);
  });
});
