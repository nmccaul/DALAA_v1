import { describe, expect, it } from "vitest";
import { formatTime } from "./time";

// 16:15:09 UTC is 10:15 in Denver (MDT) and 01:15 the next day in Tokyo.
const at = new Date("2026-10-29T16:15:09Z");

describe("formatTime", () => {
  it("writes the time in the viewer's zone, not UTC", () => {
    expect(formatTime(at, "dateTime", "America/Denver")).toBe("Oct 29, 2026, 10:15 AM");
    expect(formatTime(at, "dateTime", "UTC")).toBe("Oct 29, 2026, 4:15 PM");
  });

  it("moves the date when the zone crosses midnight", () => {
    expect(formatTime(at, "date", "Asia/Tokyo")).toBe("Oct 30, 2026");
    expect(formatTime(at, "day", "Asia/Tokyo")).toBe("Oct 30");
    expect(formatTime(at, "day", "America/Denver")).toBe("Oct 29");
  });

  it("writes clock times and accepts milliseconds", () => {
    expect(formatTime(at.getTime(), "clock", "America/New_York")).toBe("12:15:09 PM");
  });

  it("follows daylight saving time", () => {
    expect(formatTime(new Date("2026-12-01T16:15:00Z"), "dateTime", "America/Denver")).toBe("Dec 1, 2026, 9:15 AM");
  });
});
