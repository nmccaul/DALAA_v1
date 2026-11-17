import type { CardKey } from "../fields";
import { rubricPoints, type StudyChatSettings } from "../schema";
import type { ModeSlug } from "../modes";
import { isEmpty, STEP_PARTS } from "../parts";
import { groupOf, typeName } from "./types";
import type { SetupStep } from "./steps";

/** The editor cards each editing step shows (the review step has none). */
export const SETUP_CARDS: Record<Exclude<SetupStep, "review">, readonly CardKey[]> = {
  // Who the AI is, and how the chat opens.
  scenario: ["scenarios", "persona"],
  // How the teacher will know: points to listen for, sides to take, and the score.
  grading: ["touchpoints", "positions", "rubric"],
  options: ["completion"],
};

/** Kinds of chat where students take a side or choose a course of action, so positions matter. */
const SIDES: readonly ModeSlug[] = ["debate", "pitch", "case-chat"];

/**
 * The cards a step shows for these settings: Positions only when the chat has
 * some or is a kind where students take a side, so an Explain chat's grading
 * step doesn't open on an empty card.
 */
export function setupCards(step: Exclude<SetupStep, "review">, s: StudyChatSettings): readonly CardKey[] {
  const cards = SETUP_CARDS[step];
  return s.positions.length > 0 || SIDES.includes(s.mode) ? cards : cards.filter((c) => c !== "positions");
}

/**
 * The step that holds the two student switches ("students bring work", "show
 * progress"). On the review screen they sit in the scenario and touchpoints
 * cards; in the wizard they move here, so each shows on one step only.
 */
export const STUDENT_SWITCHES_STEP = "options" satisfies SetupStep;

/** Options from the mockup that don't exist yet, shown disabled on their step (ralph/PLAN.md). */
export const SETUP_COMING_SOON: Partial<Record<SetupStep, readonly string[]>> = {
  options: ["Voice conversation (talks back)", "Hints", "Feedback on each criterion"],
  grading: ["Use a saved rubric", "Allowed attempts", "Score to keep"],
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The wizard panel's note for a step, from what's stored (never from what the AI might have meant). */
export function setupNote(step: SetupStep, s: StudyChatSettings): string {
  // Nothing on the step written yet: the teacher writes it, or asks DALAA to (feedback aab2aed5).
  const blank = (STEP_PARTS[step] ?? []).every((k) => isEmpty(s, k));
  switch (step) {
    case "scenario": {
      const kind = groupOf(s.mode).label;
      return blank
        ? `Your ${kind} chat needs someone for the AI to play and a first message. Write them, or let me draft this page from your materials. Any box can be drafted or tweaked with its own button.`
        : `${s.persona.name ? `${s.persona.name} leads this ${kind} chat.` : `This is your ${kind} chat.`} The opening message is the first thing students read. Use Tweak on any box to have me rewrite it.`;
    }
    case "options":
      return "These decide when a chat ends and what students see while they chat. Leave a limit empty for none.";
    case "grading": {
      if (blank) return "Add the key points to listen for and the criteria that score, or let me draft them from your goal and materials.";
      const listen = count(s.touchpoints.length, "key point", "key points");
      return `This chat has ${listen} to listen for and ${count(s.rubric.criteria.length, "criterion", "criteria")} worth ${rubricPoints(s)} points. Key points are a checklist; only the criteria score. The activity is worth the total.`;
    }
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
    { label: "Type", value: typeName(s.mode) },
    { label: "Materials", value: count(materials, "material", "materials") },
    ...(s.positions.length > 0 ? [{ label: "Positions", value: count(s.positions.length, "position", "positions") }] : []),
    { label: "Key points", value: count(s.touchpoints.length, "key point", "key points") },
    { label: "Points", value: points === null ? "Not set" : String(points) },
  ];
}
