import { describe, expect, it } from "vitest";
import { CARD_KEYS, shownCards } from "../fields";
import { draft } from "../test-fixtures";
import { teacherActivityPath } from "@/tools/catalog";
import { blankSettings, STUDY_CHAT } from "../create";
import { reviewSummary, SETUP_CARDS, SETUP_COMING_SOON, setupCards, setupNote, STUDENT_SWITCHES_STEP } from "./setup-cards";
import { finishLaterPath, isSetupStep, nextSetupStep, previousSetupStep, RESUME_STEP, resumeStep, savedStepTarget, SETUP_STEPS, setupPath } from "./steps";

describe("shownCards", () => {
  it("shows every card without a filter, and only the asked-for ones in screen order with one", () => {
    expect(shownCards()).toEqual([...CARD_KEYS]);
    expect(shownCards(["persona", "scenarios"])).toEqual(["scenarios", "persona"]);
    expect(shownCards([])).toEqual([]);
  });

  it("puts every card except the goal on exactly one wizard step (the goal is step 2's)", () => {
    const placed = Object.values(SETUP_CARDS).flat();
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual(CARD_KEYS.filter((k) => k !== "goal").sort());
  });
});

describe("setupCards", () => {
  it("shows Positions on Grading only when the chat has some or students take a side", () => {
    expect(setupCards("grading", draft({ mode: "explain", positions: [] }))).toEqual(["touchpoints", "rubric"]);
    expect(setupCards("grading", draft({ mode: "debate", positions: [] }))).toEqual(["touchpoints", "positions", "rubric"]);
    expect(setupCards("grading", draft({ mode: "explain" }))).toContain("positions");
    expect(setupCards("scenario", draft())).toEqual(["scenarios", "persona"]);
  });
});

describe("setup steps", () => {
  it("goes scenario → grading → options → review, with no step before scenario or after review", () => {
    expect(nextSetupStep("scenario")).toBe("grading");
    expect(nextSetupStep("grading")).toBe("options");
    expect(nextSetupStep("options")).toBe("review");
    expect(nextSetupStep("review")).toBeNull();
    expect(previousSetupStep("grading")).toBe("scenario");
    // A saved activity's steps 1–2 open again (feedback 21e8c594).
    expect(previousSetupStep("scenario")).toBe("goal");
    expect(previousSetupStep("goal")).toBe("materials");
    expect(previousSetupStep("materials")).toBeNull();
    expect(nextSetupStep("materials")).toBe("goal");
    expect(nextSetupStep("goal")).toBe("scenario");
    expect(setupPath("c1", "a1", "grading")).toBe("/courses/c1/activities/a1/setup/grading");
  });

  it("after a save, Next goes on, a step-list click or Back goes to that step, and Save as draft stays (feedback a142d729, d6010bfd)", () => {
    expect(savedStepTarget("scenario", "next")).toBe("grading");
    expect(savedStepTarget("grading", "goto:scenario")).toBe("scenario");
    expect(savedStepTarget("options", "goto:review")).toBe("review");
    expect(savedStepTarget("options", "save")).toBeNull();
    expect(savedStepTarget("options", null)).toBeNull();
    expect(savedStepTarget("scenario", "goto:materials")).toBe("materials");
    expect(savedStepTarget("goal", "next")).toBe("scenario");
  });

  it("\"Save and finish later\" is not a step: it goes to the course's drafts (feedback deea6853)", () => {
    expect(savedStepTarget("options", "later")).toBeNull();
    expect(finishLaterPath("c1")).toBe("/courses/c1?show=unassigned");
  });

  it("goes nowhere it shouldn't from a save: not before step 3, not off the wizard", () => {
    expect(savedStepTarget("options", "goto:type")).toBeNull();
    expect(savedStepTarget("options", "goto:../../settings")).toBeNull();
    expect(savedStepTarget("type", "next")).toBeNull();
    expect(savedStepTarget(null, "goto:scenario")).toBeNull();
  });

  it("accepts only the four setup steps", () => {
    expect(isSetupStep("scenario")).toBe(true);
    expect(isSetupStep("type")).toBe(false);
    expect(isSetupStep("../review")).toBe(false);
    expect(isSetupStep(null)).toBe(false);
  });
});

describe("wizard steps 4–6 extras", () => {
  it("puts the student switches on an editing step, and Coming soon rows only on editing steps", () => {
    expect(Object.keys(SETUP_CARDS)).toContain(STUDENT_SWITCHES_STEP);
    for (const step of Object.keys(SETUP_COMING_SOON)) expect(Object.keys(SETUP_CARDS)).toContain(step);
    expect(SETUP_COMING_SOON.options).toContain("Voice conversation (talks back)");
    expect(SETUP_COMING_SOON.grading).toContain("Use a saved rubric");
  });

  it("opens a Study Chat draft from the Activities tab where the teacher left it, else at the first setup step (feedback 391261a8)", () => {
    expect(teacherActivityPath("c1", { id: "a1", tool: STUDY_CHAT, status: "draft" })).toBe(`/courses/c1/activities/a1/setup/${RESUME_STEP}`);
    expect(setupPath("c1", "a1", resumeStep("review"))).toBe(setupPath("c1", "a1", "review"));
    expect(resumeStep(null)).toBe(SETUP_STEPS[0]);
    expect(resumeStep("type")).toBe(SETUP_STEPS[0]);
  });
});

describe("setupNote", () => {
  it("names the kind of activity and the character, and counts what grading holds, from the stored settings", () => {
    expect(setupNote("scenario", draft())).toBe(
      "Maya Ortiz leads this Apply chat. The opening message is the first thing students read. Use Tweak on any box to have me rewrite it.",
    );
    expect(setupNote("grading", draft())).toBe(
      "This chat has 1 key point to listen for and 2 criteria worth 10 points. Key points are a checklist; only the criteria score. The activity is worth the total.",
    );
  });

  it("offers to write a step nothing's been written on yet (feedback aab2aed5)", () => {
    const blank = blankSettings({ mode: "debate", goal: "Defend a side.", studentWork: false, typeReason: null });
    expect(setupNote("scenario", blank)).toMatch(/^Your Argue chat needs someone for the AI to play and a first message\. Write them, or let me draft this page/);
    expect(setupNote("grading", blank)).toMatch(/or let me draft them from your goal and materials\.$/);
  });
});

describe("reviewSummary", () => {
  it("names what each row counts, from what's stored", () => {
    const s = draft();
    const rows = Object.fromEntries(reviewSummary(s, "Harbor Bikes", 2, 10).map((r) => [r.label, r.value]));
    expect(rows.Title).toBe("Harbor Bikes");
    expect(rows.Materials).toBe("2 materials");
    expect(rows["Key points"]).toBe(`${s.touchpoints.length} key point${s.touchpoints.length === 1 ? "" : "s"}`);
    expect(rows.Points).toBe("10");
  });

  it("leaves out positions a chat doesn't have, and says Not set for no points (never 0)", () => {
    const rows = reviewSummary(draft({ positions: [] }), "T", 1, null);
    expect(rows.map((r) => r.label)).not.toContain("Positions");
    expect(rows.find((r) => r.label === "Materials")?.value).toBe("1 material");
    expect(rows.find((r) => r.label === "Points")?.value).toBe("Not set");
  });
});
