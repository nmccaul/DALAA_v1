import { describe, expect, it } from "vitest";
import { editActivityPath, findTool, isLive, LIVE_TOOLS, newActivityPath, teacherActivityPath, TOOLS } from "./catalog";

describe("tool registry", () => {
  it("has unique, URL-safe slugs", () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("has Study Chat live and the others coming soon", () => {
    expect(TOOLS.filter(isLive).map((t) => t.slug)).toEqual(["study-chat"]);
    expect(findTool("quizzer")?.status).toBe("coming-soon");
    expect(findTool("oral-assessment")?.status).toBe("coming-soon");
  });

  it("finds nothing for an unknown slug", () => {
    expect(findTool("case-chat")).toBeUndefined();
  });

  it("gives each tool an accent white text can sit on", () => {
    // WCAG relative luminance; white on the accent must reach 4.5:1.
    const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    for (const tool of TOOLS) {
      const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(tool.accent.slice(i, i + 2), 16) / 255));
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(1.05 / (luminance + 0.05), tool.slug).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("starts each live tool at its first step, and lists only live tools as startable", () => {
    expect(LIVE_TOOLS.map((t) => t.slug)).toEqual(["study-chat"]);
    expect(newActivityPath("c1", LIVE_TOOLS[0])).toBe("/courses/c1/activities/new/study-chat?step=materials");
    expect(newActivityPath("c1", { ...TOOLS[1], start: undefined })).toBe(`/courses/c1/activities/new/${TOOLS[1].slug}`);
  });

  it("opens a draft at its tool's setup steps, and anything else (or a tool without them) at the activity", () => {
    expect(teacherActivityPath("c1", { id: "a1", tool: "study-chat", status: "draft" })).toBe("/courses/c1/activities/a1/setup/scenario");
    expect(teacherActivityPath("c1", { id: "a1", tool: "study-chat", status: "published" })).toBe("/courses/c1/activities/a1");
    expect(teacherActivityPath("c1", { id: "a1", tool: "quizzer", status: "draft" })).toBe("/courses/c1/activities/a1");
    expect(teacherActivityPath("c1", { id: "a1", tool: "gone", status: "draft" })).toBe("/courses/c1/activities/a1");
  });

  it("sends Edit to the tool's setup steps whatever the status, else the activity's page", () => {
    expect(editActivityPath("c1", { id: "a1", tool: "study-chat" })).toBe("/courses/c1/activities/a1/setup/scenario");
    expect(editActivityPath("c1", { id: "a1", tool: "quizzer" })).toBe("/courses/c1/activities/a1");
    expect(editActivityPath("c1", { id: "a1", tool: "gone" })).toBe("/courses/c1/activities/a1");
  });
});
