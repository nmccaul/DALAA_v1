import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { cite } from "./ask-panel";

const flat = (nodes: ReturnType<typeof cite>) =>
  nodes.map((n) => (isValidElement<{ href: string; children: string }>(n) ? `<${n.props.children}|${n.props.href}>` : n)).join("");

describe("cite", () => {
  it("links each student cited, by name only when names are shown", () => {
    const labels = { S1: "a1", S2: "a2" };
    expect(flat(cite("Ask [S1] and [S2, S9] why.", labels, {}, "/g/attempts"))).toBe(
      "Ask <Student 1|/g/attempts/a1?from=insights> and <Student 2|/g/attempts/a2?from=insights>, Student 9 why.",
    );
    expect(flat(cite("[S2] did well.", labels, { a2: "Ben" }, "/g"))).toBe("<Ben|/g/a2?from=insights> did well.");
  });
});
