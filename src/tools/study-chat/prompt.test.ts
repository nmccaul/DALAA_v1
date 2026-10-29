import { describe, expect, it } from "vitest";
import { MODES } from "./modes";
import { chatMessages, chatSystemPrompt } from "./prompt";
import { draft } from "./test-fixtures";

const content = { name: "Case: Harbor Bikes", body: "Harbor Bikes sells 1,200 bikes a year." };

describe("the chat prompt", () => {
  it("puts the persona, mode, scenario, goal, positions and material in", () => {
    const settings = draft();
    const prompt = chatSystemPrompt(settings, content, null, null);
    for (const part of [
      "You are Maya Ortiz, Owner of Harbor Bikes",
      settings.persona.background,
      settings.persona.tone,
      MODES["case-chat"].promptSeed,
      settings.scenarios[0].situation,
      settings.scenarios[0].opening,
      settings.goal,
      "- Open it: Expand now while the lease is available.",
      "at most 12 messages",
      'What the student read before the chat ("Case: Harbor Bikes")',
      content.body,
      "Don't make up facts or figures",
    ]) {
      expect(prompt).toContain(part);
    }
  });

  it("runs a Defend chat as an examiner of the student's own work", () => {
    const work = { name: "My essay.docx", body: "Second stores fail when cash flow is seasonal." };
    const prompt = chatSystemPrompt(draft({ mode: "defend", studentWork: true }), content, null, work);
    expect(prompt).toContain(`What kind of conversation this is: ${MODES.defend.promptSeed}`);
    expect(prompt).toContain('The student\'s own work ("My essay.docx")');
    expect(prompt).toMatch(/<material role="student-work">[\s\S]*Second stores fail when cash flow is seasonal\.[\s\S]*<\/material>/);
    expect(prompt.indexOf(MODES.defend.promptSeed)).toBeLessThan(prompt.indexOf("Second stores fail"));
  });

  it("leaves the rubric and touchpoints for the grader", () => {
    const settings = draft();
    const prompt = chatSystemPrompt(settings, content, null, null);
    for (const hidden of [
      ...settings.rubric.criteria.flatMap((c) => [c.label, c.description]),
      ...settings.touchpoints.flatMap((t) => [t.label, t.description]),
    ]) {
      expect(prompt).not.toContain(hidden);
    }
  });

  it("names the question only when there is one, and skips what's missing", () => {
    const settings = draft({
      positions: [],
      completion: { maxTurns: null, timeLimitMinutes: 20, question: "Should Maya open the store?", studentCanFinish: false },
    });
    const prompt = chatSystemPrompt(settings, null, null, null);
    expect(prompt).toContain("Should Maya open the store?");
    expect(prompt).not.toContain("Directions the student may take");
    expect(prompt).not.toContain("at most");
    expect(prompt).not.toContain("<material");
    expect(chatSystemPrompt(draft(), content, null, null)).not.toContain("Make sure the conversation reaches this question");
  });

  it("replays the conversation in order and ends with the new message", () => {
    expect(chatMessages([{ message: "Hi", reply: "Hello" }], "Next")).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "Next" },
    ]);
  });
});
