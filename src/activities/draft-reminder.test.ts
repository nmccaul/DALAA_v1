import { describe, expect, it } from "vitest";
import { reminderHidden, reminderValue, SNOOZE_MS } from "./draft-reminder";

describe("draft reminder", () => {
  const now = Date.UTC(2026, 10, 22, 12);

  it("hides for the dismissed draft only", () => {
    const value = reminderValue("a", "never");
    expect(reminderHidden(value, "a", now)).toBe(true);
    expect(reminderHidden(value, "b", now)).toBe(false);
    expect(reminderHidden(undefined, "a", now)).toBe(false);
  });

  it("comes back once tomorrow arrives", () => {
    const value = reminderValue("a", now + SNOOZE_MS);
    expect(reminderHidden(value, "a", now)).toBe(true);
    expect(reminderHidden(value, "a", now + SNOOZE_MS + 1)).toBe(false);
    expect(reminderHidden("a.junk", "a", now)).toBe(false);
  });
});
