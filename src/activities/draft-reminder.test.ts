import { describe, expect, it } from "vitest";
import { reminderHidden, reminderText, reminderValue, showsReminder, SNOOZE_MS } from "./draft-reminder";

describe("draft reminder", () => {
  const now = Date.UTC(2026, 10, 22, 12);

  it("✕ hides it until a new draft appears", () => {
    const value = reminderValue(["a", "b"], "never");
    expect(reminderHidden(value, ["a", "b"], now)).toBe(true);
    expect(reminderHidden(value, ["a"], now)).toBe(true);
    expect(reminderHidden(value, ["a", "b", "c"], now)).toBe(false);
    expect(reminderHidden(undefined, ["a"], now)).toBe(false);
  });

  it("comes back once tomorrow arrives", () => {
    const value = reminderValue(["a"], now + SNOOZE_MS);
    expect(reminderHidden(value, ["a"], now)).toBe(true);
    expect(reminderHidden(value, ["a"], now + SNOOZE_MS + 1)).toBe(false);
    expect(reminderHidden("junk.a", ["a"], now)).toBe(false);
  });

  it("an old one-draft cookie hides nothing", () => {
    expect(reminderHidden("1f0e3a2c-0000-4000-8000-000000000000.never", ["1f0e3a2c-0000-4000-8000-000000000000"], now)).toBe(false);
  });

  it("shows on Assigned only, when there are drafts", () => {
    expect(showsReminder("assigned", ["a"], undefined, now)).toBe(true);
    expect(showsReminder("unassigned", ["a"], undefined, now)).toBe(false);
    expect(showsReminder("other", ["a"], undefined, now)).toBe(false);
    expect(showsReminder("assigned", [], undefined, now)).toBe(false);
    expect(showsReminder("assigned", ["a"], reminderValue(["a"], "never"), now)).toBe(false);
  });

  it("counts what isn't finished", () => {
    expect(reminderText(1)).toEqual({ line: "1 activity isn't finished.", link: "See it" });
    expect(reminderText(2)).toEqual({ line: "2 activities aren't finished.", link: "See them" });
  });
});
