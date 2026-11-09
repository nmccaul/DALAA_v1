import { describe, expect, it } from "vitest";
import { afterAddPath, materialReturnPath } from "./return-path";

const C = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const step = `/courses/${C}/activities/new/study-chat?step=materials&content=${ID}`;

describe("materialReturnPath", () => {
  it("keeps a path inside this course, query and all", () => {
    expect(materialReturnPath(step, C)).toBe(step);
  });

  it("refuses anything outside this course", () => {
    for (const next of [
      undefined,
      "",
      "https://evil.example/",
      "//evil.example/x",
      "/settings",
      `/courses/${ID}/materials`,
      `/courses/${C}/../${ID}/materials`,
      `/courses/${C}/%2e%2e/${ID}`,
      `/courses/${C}\\..\\x`,
      `/courses/${C}`,
    ]) {
      expect(materialReturnPath(next, C), String(next)).toBeNull();
    }
  });
});

describe("afterAddPath", () => {
  it("goes back to next with the new reading or AI-only note marked added", () => {
    const back = new URL(afterAddPath(step, C, { id: ID, aiOnly: false }), "http://x");
    expect(back.pathname).toBe(`/courses/${C}/activities/new/study-chat`);
    expect(back.searchParams.get("content")).toBe(ID);
    expect(back.searchParams.get("added")).toBe(`content:${ID}`);
    expect(new URL(afterAddPath(step, C, { id: ID, aiOnly: true }), "http://x").searchParams.get("added")).toBe(`guide:${ID}`);
  });

  it("goes to the Materials tab without a usable next", () => {
    expect(afterAddPath(null, C, { id: ID, aiOnly: false })).toBe(`/courses/${C}/materials?added=${ID}`);
    expect(afterAddPath("/settings", C, { id: ID, aiOnly: true })).toBe(`/courses/${C}/materials?added=${ID}`);
  });
});
