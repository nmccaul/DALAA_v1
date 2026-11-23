import { describe, expect, it } from "vitest";
import { backTo } from "./back";

const C = "c1";
describe("backTo", () => {
  it("returns to the Results page the form came from, keeping what places it and dropping old outcomes", () => {
    expect(backTo(C, "/courses/c1/grading?view=disputes&saved=old", { resolved: "a1" }, "a1")).toBe(
      "/courses/c1/grading?view=disputes&resolved=a1#a1",
    );
    expect(backTo(C, "/courses/c1/grading/attempts/a1", { saved: "a1" }, "a1")).toBe("/courses/c1/grading/attempts/a1?saved=a1#a1");
    expect(backTo(C, "/courses/c1/grading?assignment=x1&open=a1&from=insights&saved=old&evil=1", { saved: "a1" }, "a1")).toBe(
      "/courses/c1/grading?assignment=x1&open=a1&from=insights&saved=a1#a1",
    );
  });

  it("sends anything else to the Results tab", () => {
    for (const from of [null, "https://evil.example/x", "//evil.example/courses/c1/grading", "/courses/c2/grading", "/courses/c1/gradingx"]) {
      expect(backTo(C, from, { saved: "a1" }, "a1")).toBe("/courses/c1/grading?saved=a1#a1");
    }
  });
});
