import { describe, expect, it } from "vitest";
import { studentView } from "./student-view";
import { draft } from "./test-fixtures";

describe("studentView", () => {
  it("passes only the title, goal, criterion names and points, opening, persona name and role, whether to bring work, and the limits", () => {
    const settings = draft({
      completion: { maxTurns: null, timeLimitMinutes: 20, question: "Should Maya open the store?", studentCanFinish: false },
    });
    expect(studentView(settings)).toEqual({
      title: "Second store",
      goal: settings.goal,
      criteria: settings.rubric.criteria.map((c) => ({ label: c.label, points: c.points })),
      opening: "Thanks for coming in. I have to decide about the second store by Friday. Where do we start?",
      persona: { name: "Maya Ortiz", role: "Owner of Harbor Bikes" },
      bringsWork: false,
      limits: { maxTurns: null, timeLimitMinutes: 20, question: "Should Maya open the store?", studentCanFinish: false },
    });
  });

  it("leaves out everything meant for the AI and the grader", () => {
    const settings = draft();
    const sent = JSON.stringify(studentView(settings));
    const hidden = [
      settings.scenarios[0].situation,
      settings.persona.background,
      settings.persona.tone,
      ...settings.positions.flatMap((p) => [p.label, p.description]),
      ...settings.touchpoints.flatMap((t) => [t.label, t.description]),
      // Criterion names are shown (abf69c71); what earns full points never is.
      ...settings.rubric.criteria.map((c) => c.description),
    ];
    for (const text of hidden) expect(sent).not.toContain(text);
    expect(sent).not.toMatch(/rubric|strictness|helpfulness|touchpoint|position/i);
  });
});

