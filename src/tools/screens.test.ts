import { describe, expect, it } from "vitest";
import { isLive, TOOLS } from "./catalog";
import { screensFor } from "./screens";

describe("tool screens", () => {
  it("gives every live tool a create and a review screen, and nothing to a tool that isn't live", () => {
    for (const tool of TOOLS) expect(screensFor(tool.slug) !== undefined, tool.slug).toBe(isLive(tool));
    expect(screensFor("constructor")).toBeUndefined();
  });
});
