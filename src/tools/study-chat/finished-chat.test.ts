import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinishedChat } from "./finished-chat";

describe("FinishedChat", () => {
  const html = renderToStaticMarkup(
    createElement(FinishedChat, {
      ended: "You've finished this chat.",
      messages: 3,
      result: createElement("p", null, "GRADE"),
      conversation: createElement("p", null, "TRANSCRIPT"),
    }),
  );

  it("leads with why it ended and the grade, before the conversation", () => {
    expect(html.indexOf("You&#x27;ve finished this chat.")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("GRADE")).toBeLessThan(html.indexOf("TRANSCRIPT"));
  });

  it("folds the conversation away, closed, under a label that says what it is", () => {
    expect(html).toMatch(/<details(?![^>]*\bopen\b)[^>]*>/);
    expect(html).toContain("See your conversation (3 messages from you)");
  });
});
