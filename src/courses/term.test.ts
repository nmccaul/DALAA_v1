import { describe, expect, it } from "vitest";
import { upcomingTerm } from "./term";

describe("upcomingTerm", () => {
  it.each([
    ["2026-10-03", "Winter 2027"],
    ["2026-12-31", "Winter 2027"],
    ["2027-01-15", "Spring 2027"],
    ["2027-05-10", "Summer 2027"],
    ["2027-07-20", "Fall 2027"],
  ])("%s → %s", (date, term) => {
    expect(upcomingTerm(new Date(`${date}T12:00:00`))).toBe(term);
  });
});
