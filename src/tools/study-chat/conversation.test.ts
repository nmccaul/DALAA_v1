import { describe, expect, it } from "vitest";
import { clip } from "./conversation";

describe("clip", () => {
  it("keeps short text and cuts long text at a word", () => {
    expect(clip("  Short\n reply ", 20)).toBe("Short reply");
    expect(clip("one two three four five six", 15)).toBe("one two three…");
    expect(clip("x".repeat(30), 10)).toBe(`${"x".repeat(10)}…`);
  });
});
