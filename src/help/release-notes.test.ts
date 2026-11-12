import { describe, expect, it } from "vitest";
import { noteDate, RELEASE_NOTES } from "./release-notes";

describe("release notes", () => {
  it("are dated YYYY-MM-DD, newest first, one entry per day, none empty", () => {
    const dates = RELEASE_NOTES.map((n) => n.date);
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dates).toEqual([...new Set(dates)].sort().reverse());
    for (const n of RELEASE_NOTES) expect(n.changes.length, n.date).toBeGreaterThan(0);
  });

  it("show the date as written, whatever the time zone", () => {
    expect(noteDate("2026-11-12")).toBe("November 12, 2026");
  });
});
