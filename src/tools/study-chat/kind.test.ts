import { describe, expect, it } from "vitest";
import { studyChatKind } from "./kind";
import { MODE_SLUGS } from "./modes";
import { groupOf } from "./wizard/types";

describe("studyChatKind", () => {
  it("names the wizard's group, with the style when the group has more than one", () => {
    expect(studyChatKind({ mode: "pitch" })?.label).toBe("Argue · Pitch");
    expect(studyChatKind({ mode: "explain" })?.label).toBe("Explain / teach back");
    expect(studyChatKind({ mode: "socratic" })?.label).toBe("Question");
  });

  it("uses the same icon as the wizard's type card", () => {
    for (const mode of MODE_SLUGS) expect(studyChatKind({ mode })?.icon).toBe(groupOf(mode).icon);
    expect(studyChatKind({ mode: "debate" })?.icon).not.toBe(studyChatKind({ mode: "explain" })?.icon);
  });

  it("has no kind for a draft without a mode, or one it doesn't know", () => {
    expect(studyChatKind({})).toBeNull();
    expect(studyChatKind({ mode: "quiz" })).toBeNull();
    expect(studyChatKind({ mode: 3 })).toBeNull();
  });
});
