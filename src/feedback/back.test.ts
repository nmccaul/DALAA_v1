import { describe, expect, it } from "vitest";
import { feedbackBack, reportHref } from "./back";

const course = "0e0735e5-ad33-470d-8713-bb0464c9ed00";

describe("feedbackBack", () => {
  it("goes back to the Help tab's list it came from, filters kept", () => {
    const from = `/courses/${course}/help?tab=activities&priority=none#feedback`;
    expect(feedbackBack(from)).toEqual({ href: from, label: "‹ Back to feedback" });
    expect(feedbackBack(`/courses/${course}/help`).href).toBe(`/courses/${course}/help#feedback`);
  });

  it("round-trips through a report's link", () => {
    const from = `/courses/${course}/help?feedback=mine&type=bug#feedback`;
    const href = reportHref("abc", from);
    expect(href.startsWith("/settings/feedback/abc?from=")).toBe(true);
    expect(feedbackBack(new URL(href, "http://x").searchParams.get("from") ?? undefined).href).toBe(from);
  });

  it("falls back to the inbox for anything else", () => {
    for (const from of [undefined, ["a", "b"], "", "https://evil.example/courses", "//evil.example", `/courses/${course}/grading`, `/courses/${course}/help/../../x`, "/\\evil.example"]) {
      expect(feedbackBack(from)).toEqual({ href: "/settings/feedback", label: "‹ All feedback reports" });
    }
  });
});
