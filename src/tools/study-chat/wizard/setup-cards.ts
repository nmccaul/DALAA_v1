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
      return "These decide when a chat ends. Leave a limit empty for none.";
    case "grading":
      return `I drafted ${count(s.rubric.criteria.length, "criterion", "criteria")} worth ${rubricPoints(s)} points. The activity is worth the total.`;
    case "review":
      return "Check the summary, try it as a student, then assign it.";
  }
}
