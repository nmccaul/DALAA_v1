import { describe, expect, it } from "vitest";
import { MODE_SLUGS, MODES } from "./modes";
import { FIELDS } from "./fields";
import { rubricPoints, settingProblems, settingTitle, StudyChatSettings } from "./schema";

const valid = (): StudyChatSettings => ({
  mode: "case-chat",
  goal: "Recommend whether Harbor Bikes should open a second store, using evidence from the case.",
  scenarios: [
    {
      title: "Second store",
      situation: "Maya, the owner, is deciding whether to open a second store and wants advice.",
      opening: "Thanks for coming in. I have to decide about the second store by Friday. Where do we start?",
    },
  ],
  positions: [
    { label: "Open it", description: "Expand now while the lease is available." },
    { label: "Wait", description: "Fix cash flow first." },
  ],
  touchpoints: [{ label: "Cash flow", description: "Notices the seasonal cash squeeze." }],
  persona: {
    name: "Maya Ortiz",
    title: "Owner of Harbor Bikes",
    background: "Started the shop ten years ago.",
    tone: "Warm but busy",
    helpfulness: "balanced",
  },
  completion: { maxTurns: 12, timeLimitMinutes: null, question: null, studentCanFinish: true },
  rubric: {
    criteria: [
      { label: "Questions", description: "Asks questions that uncover the key facts.", points: 4 },
      { label: "Recommendation", description: "Makes a recommendation backed by evidence.", points: 6 },
    ],
    strictness: "balanced",
  },
});

const errorsOf = (value: unknown) => {
  const result = StudyChatSettings.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
};

describe("Study Chat settings", () => {
  it("accepts a complete draft and trims text", () => {
    const s = valid();
    s.goal = "  Recommend a plan.  ";
    const parsed = StudyChatSettings.parse(s);
    expect(parsed.goal).toBe("Recommend a plan.");
    expect(rubricPoints(parsed)).toBe(10);
  });

  it("accepts no positions or touchpoints", () => {
    expect(errorsOf({ ...valid(), positions: [], touchpoints: [] })).toEqual([]);
  });

  it("refuses unknown keys, so nothing is stored and ignored", () => {
    expect(errorsOf({ ...valid(), maxExchanges: 5 })).toEqual([""]);
    const s = valid();
    expect(errorsOf({ ...s, persona: { ...s.persona, mood: "grumpy" } })).toEqual(["persona"]);
  });

  it("refuses blank or missing text", () => {
    expect(errorsOf({ ...valid(), goal: "   " })).toEqual(["goal"]);
    const noGoal: Partial<StudyChatSettings> = valid();
    delete noGoal.goal;
    expect(errorsOf(noGoal)).toEqual(["goal"]);
  });

  it("runs exactly one scenario in v1", () => {
    const s = valid();
    expect(errorsOf({ ...s, scenarios: [] })).toEqual(["scenarios"]);
    expect(errorsOf({ ...s, scenarios: [s.scenarios[0], s.scenarios[0]] })).toEqual(["scenarios"]);
  });

  it("refuses a mode that doesn't exist", () => {
    expect(errorsOf({ ...valid(), mode: "lecture" })).toEqual(["mode"]);
  });

  it("uses NULL for no limit, never 0", () => {
    const s = valid();
    expect(errorsOf({ ...s, completion: { ...s.completion, maxTurns: 0 } })).toEqual(["completion.maxTurns"]);
    expect(errorsOf({ ...s, completion: { ...s.completion, maxTurns: 2.5 } })).toEqual(["completion.maxTurns"]);
    expect(errorsOf({ ...s, completion: { ...s.completion, timeLimitMinutes: 0 } })).toEqual([
      "completion.timeLimitMinutes",
    ]);
  });

  it("needs at least one way for the chat to end", () => {
    const never = { maxTurns: null, timeLimitMinutes: null, question: null, studentCanFinish: false };
    expect(errorsOf({ ...valid(), completion: never })).toEqual(["completion"]);
    expect(errorsOf({ ...valid(), completion: { ...never, question: "Should she open it?" } })).toEqual([]);
  });

  it("needs a rubric with positive points and a known strictness", () => {
    const s = valid();
    expect(errorsOf({ ...s, rubric: { ...s.rubric, criteria: [] } })).toEqual(["rubric.criteria"]);
    expect(
      errorsOf({ ...s, rubric: { ...s.rubric, criteria: [{ ...s.rubric.criteria[0], points: 0 }] } }),
    ).toEqual(["rubric.criteria.0.points"]);
    expect(errorsOf({ ...s, rubric: { ...s.rubric, strictness: "harsh" } })).toEqual(["rubric.strictness"]);
  });

  it("gives every field a label for the review screen", () => {
    const json = JSON.stringify(StudyChatSettings.toJSONSchema());
    for (const label of ["Goal", "Positions", "Touchpoints", "Persona", "When the chat ends", "Grading"]) {
      expect(json).toContain(`"title":"${label}"`);
    }
  });
});

describe("Study Chat modes", () => {
  it("has the ten modes, each keyed by its own slug and fully described", () => {
    expect(MODE_SLUGS).toHaveLength(10);
    for (const slug of MODE_SLUGS) {
      const mode = MODES[slug];
      expect(mode.slug).toBe(slug);
      for (const value of [mode.label, mode.description, mode.promptSeed, ...Object.values(mode.hints)]) {
        expect(value.trim()).not.toBe("");
      }
    }
    expect(Object.keys(MODES).sort()).toEqual([...MODE_SLUGS].sort());
  });
});

describe("setting labels", () => {
  it("come from the schema, through lists and nullable fields", () => {
    expect(settingTitle(["goal"])).toBe("Goal");
    expect(settingTitle(["scenarios", "opening"])).toBe("Opening message");
    expect(settingTitle(["rubric", "criteria", 2, "points"])).toBe("Points");
    expect(settingTitle(["completion", "maxTurns"])).toBe("Most student messages");
    expect(() => settingTitle(["nope"])).toThrow();
  });

  it("exist for every setting the review screen can search", () => {
    for (const field of FIELDS) {
      expect(settingTitle(field.path)).not.toBe("");
      expect(settingTitle([field.path[0]])).not.toBe("");
    }
  });

  it("name what needs fixing in plain sentences", () => {
    const s = valid();
    s.goal = " ";
    s.persona.tone = "x".repeat(301);
    s.completion = { maxTurns: null, timeLimitMinutes: 0, question: null, studentCanFinish: false };
    const result = StudyChatSettings.safeParse(s);
    if (result.success) throw new Error("expected a problem");
    expect(settingProblems(result.error)).toEqual([
      "“Goal” can't be empty.",
      "“Tone” is too long.",
      "“Time limit (minutes)” is too low or too short.",
    ]);
  });

  it("pass the custom message through", () => {
    const s = valid();
    s.completion = { maxTurns: null, timeLimitMinutes: null, question: null, studentCanFinish: false };
    const result = StudyChatSettings.safeParse(s);
    if (result.success) throw new Error("expected a problem");
    expect(settingProblems(result.error)).toEqual(["The chat needs at least one way to end."]);
  });
});
