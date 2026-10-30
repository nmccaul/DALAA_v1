import { describe, expect, it } from "vitest";
import { startedNote } from "./review-screen";

describe("startedNote", () => {
  it("says nothing until a student starts, then says edits reach only new attempts", () => {
    expect(startedNote(0)).toBeNull();
    expect(startedNote(1)).toBe("1 student has started; changes apply to new attempts only.");
    expect(startedNote(18)).toBe("18 students have started; changes apply to new attempts only.");
  });
});
