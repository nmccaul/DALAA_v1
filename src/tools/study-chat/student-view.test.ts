import { describe, expect, it } from "vitest";
import { studentView } from "./student-view";
import { draft } from "./test-fixtures";

describe("studentView", () => {
  it("passes only the title, opening, persona name and role, and the limits", () => {
    const settings = draft({
      completion: { maxTurns: null, timeLimitMinutes: 20, question: "Should Maya open the store?", studentCanFinish: false },
    });
    expect(studentView(settings)).toEqual({
      title: "Second store",
      opening: "Thanks for coming in. I have to decide about the second store by Friday. Where do we start?",
      persona: { name: "Maya Ortiz", role: "Owner of Harbor Bikes" },
      limits: { maxTurns: null, timeLimitMinutes: 20, question: "Should Maya open the store?", studentCanFinish: false },
    });
  });

  it("leaves out everything meant for the AI and the grader", () => {
    const settings = draft();
    const sent = JSON.stringify(studentView(settings));
    const hidden = [
      settings.goal,
      settings.scenarios[0].situation,
      settings.persona.background,
      settings.persona.tone,
      ...settings.positions.flatMap((p) => [p.label, p.description]),
      ...settings.touchpoints.flatMap((t) => [t.label, t.description]),
      ...settings.rubric.criteria.flatMap((c) => [c.label, c.description]),
    ];
    for (const text of hidden) expect(sent).not.toContain(text);
    expect(sent).not.toMatch(/rubric|strictness|helpfulness|touchpoint|position/i);
  });
});
