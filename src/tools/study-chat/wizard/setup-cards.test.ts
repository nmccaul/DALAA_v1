import { describe, expect, it } from "vitest";
import { CARD_KEYS, shownCards } from "../fields";
import { draft } from "../test-fixtures";
import { teacherActivityPath } from "@/tools/catalog";
import { STUDY_CHAT } from "../create";
import { SETUP_CARDS, SETUP_COMING_SOON, setupNote, STUDENT_SWITCHES_STEP } from "./setup-cards";
import { isSetupStep, nextSetupStep, previousSetupStep, SETUP_STEPS, setupPath } from "./steps";

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

describe("setup steps", () => {
  it("goes scenario → options → grading → review, with no step before scenario or after review", () => {
    expect(nextSetupStep("scenario")).toBe("options");
    expect(nextSetupStep("grading")).toBe("review");
    expect(nextSetupStep("review")).toBeNull();
    expect(previousSetupStep("options")).toBe("scenario");
    expect(previousSetupStep("scenario")).toBeNull();
    expect(setupPath("c1", "a1", "grading")).toBe("/courses/c1/activities/a1/setup/grading");
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
    expect(SETUP_COMING_SOON.options).toContain("Minimum exchanges");
    expect(SETUP_COMING_SOON.grading).toContain("Use a saved rubric");
  });

  it("opens a Study Chat draft from the Activities tab at the first setup step", () => {
    expect(teacherActivityPath("c1", { id: "a1", tool: STUDY_CHAT, status: "draft" })).toBe(setupPath("c1", "a1", SETUP_STEPS[0]));
  });
});

describe("setupNote", () => {
  it("counts what was drafted, from the stored settings", () => {
    expect(setupNote("scenario", draft())).toBe(
      "I drafted this chat as Case Chat, with 2 positions and 1 touchpoint, and Maya Ortiz to lead it. Change anything that doesn't fit your class.",
    );
    expect(setupNote("grading", draft())).toBe("I drafted 2 criteria worth 10 points. The activity is worth the total.");
  });

  it("leaves positions out when there are none", () => {
    expect(setupNote("scenario", draft({ positions: [] }))).toMatch(/^I drafted this chat as Case Chat, with 1 touchpoint, and/);
  });
});
