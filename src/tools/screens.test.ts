import { describe, expect, it } from "vitest";
import { isLive, TOOLS } from "./catalog";
import { screensFor } from "./screens";

describe("tool screens", () => {
  it("gives every live tool a create, review and student screen, and nothing to a tool that isn't live", () => {
    for (const tool of TOOLS) {
      expect(screensFor(tool.slug) !== undefined, tool.slug).toBe(isLive(tool));
      if (isLive(tool)) {
        const screen = expect.any(Function);
        expect(screensFor(tool.slug)).toMatchObject({ create: screen, review: screen, take: screen });
      }
    }
    expect(screensFor("constructor")).toBeUndefined();
  });
});
