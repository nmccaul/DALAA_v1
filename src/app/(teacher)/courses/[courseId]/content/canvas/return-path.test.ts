import { describe, expect, it } from "vitest";
import { afterPick } from "./return-path";

describe("afterPick", () => {
  it("returns to the step that asked, adding the saved content", () => {
    expect(afterPick("c1", "/courses/c1/activities/new/study-chat?step=content", "k9")).toBe(
      "/courses/c1/activities/new/study-chat?step=content&content=k9",
    );
  });

  it("hands a guide back as ?guide=, keeping the material it was added to", () => {
    expect(afterPick("c1", "/courses/c1/activities/new/study-chat?content=k1", "g2", "guide")).toBe(
      "/courses/c1/activities/new/study-chat?content=k1&guide=g2",
    );
  });

  it("comes back to the picker when nothing asked, and never leaves the site", () => {
    expect(afterPick("c1", "", "k9")).toBe("/courses/c1/content/canvas?content=k9");
    expect(afterPick("c1", null, "k9")).toBe("/courses/c1/content/canvas?content=k9");
    expect(afterPick("c1", "//evil.test/x", "k9")).toBe("/settings?content=k9");
  });
});
