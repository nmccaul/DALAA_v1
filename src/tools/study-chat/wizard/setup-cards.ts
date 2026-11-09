import type { CardKey } from "../fields";
import { rubricPoints, type StudyChatSettings } from "../schema";
import { MODES } from "../modes";
import type { SetupStep } from "./steps";

/** The editor cards each editing step shows (the review step has none). */
export const SETUP_CARDS: Record<Exclude<SetupStep, "review">, readonly CardKey[]> = {
  scenario: ["scenarios", "positions", "touchpoints", "persona"],
  options: ["completion"],
  grading: ["rubric"],
};

/**
 * The step that holds the two student switches ("students bring work", "show
 * progress"). On the review screen they sit in the scenario and touchpoints
 * cards; in the wizard they move here, so each shows on one step only.
 */
export const STUDENT_SWITCHES_STEP = "options" satisfies SetupStep;

/** Options from the mockup that don't exist yet, shown disabled on their step (ralph/PLAN.md). */
export const SETUP_COMING_SOON: Partial<Record<SetupStep, readonly string[]>> = {
  options: ["Hints", "Reading beside the chat", "Minimum exchanges", "Feedback on each criterion"],
  grading: ["Redraft with AI", "Use a saved rubric", "Allowed attempts", "Score to keep"],
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The wizard panel's note for a step, from what's stored (never from what the AI might have meant). */
export function setupNote(step: SetupStep, s: StudyChatSettings): string {
  switch (step) {
    case "scenario": {
      const drafted = [
        s.positions.length > 0 && count(s.positions.length, "position", "positions"),
        count(s.touchpoints.length, "touchpoint", "touchpoints"),
      ].filter((x): x is string => typeof x === "string");
      return `I drafted this chat as ${MODES[s.mode].label}, with ${drafted.join(" and ")}, and ${s.persona.name} to lead it. Change anything that doesn't fit your class.`;
    }
    case "options":
      return "These decide when a chat ends and what students see while they chat. Leave a limit empty for none.";
    case "grading":
      return `I drafted ${count(s.rubric.criteria.length, "criterion", "criteria")} worth ${rubricPoints(s)} points. The activity is worth the total.`;
    case "review":
      return "Check the summary, try it as a student, then assign it.";
  }
}

/**
 * Step 7's summary rows, from what's stored. Positions show only for a chat
 * that has them; points NULL (not drafted yet) says so rather than 0.
 */
export function reviewSummary(
  s: StudyChatSettings,
  title: string,
  materials: number,
  points: number | null,
): { label: string; value: string }[] {
  return [
    { label: "Title", value: title },
    { label: "Type", value: MODES[s.mode].label },
    { label: "Materials", value: count(materials, "material", "materials") },
    ...(s.positions.length > 0 ? [{ label: "Positions", value: count(s.positions.length, "position", "positions") }] : []),
    { label: "Touchpoints", value: count(s.touchpoints.length, "touchpoint", "touchpoints") },
    { label: "Points", value: points === null ? "Not set" : String(points) },
  ];
}
