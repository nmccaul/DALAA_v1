/**
 * The kinds of Study Chat a teacher picks from on step 2, grouped by what the
 * student does (Nathan, 2026-11-13: a clear, MECE set). Each group holds one
 * or more modes (modes.ts): a mode keeps its own tested prompts, and the
 * settings store the mode, so grouping changes only what the teacher sees.
 */

import { MODES, type ModeSlug } from "../modes";

export type TypeGroup = {
  key: string;
  label: string;
  /** What the student does, in one line. */
  does: string;
  /** Who the AI is and what it does, in one line, so the kind is easy to picture. */
  ai: string;
  /** The modes in this group, the usual one first. Two or more show a "Style" choice. */
  modes: readonly ModeSlug[];
};

export const TYPE_GROUPS: readonly TypeGroup[] = [
  {
    key: "explain",
    label: "Explain / teach back",
    does: "Students teach the idea in their own words.",
    ai: "The AI plays a curious beginner who keeps asking \"why?\" and \"what does that mean?\"",
    modes: ["explain"],
  },
  {
    key: "apply",
    label: "Apply",
    does: "Students use the material to solve a new problem or a case.",
    ai: "The AI presents the situation (or plays someone in the case) and asks what they'd do.",
    modes: ["apply", "case-chat"],
  },
  {
    key: "argue",
    label: "Argue",
    does: "Students take a position, or pitch an idea, and back it up.",
    ai: "The AI pushes back with counter-arguments and tough questions.",
    modes: ["debate", "pitch"],
  },
  {
    key: "question",
    label: "Question",
    does: "Students reason through an idea out loud.",
    ai: "The AI asks probing questions (\"how do you know?\") but never gives the answer.",
    modes: ["socratic"],
  },
  {
    key: "practice",
    label: "Practice a conversation",
    does: "Students rehearse a real conversation: an interview, a negotiation, a hard talk.",
    ai: "The AI plays the other person, realistically.",
    modes: ["roleplay", "interview"],
  },
  {
    key: "connect",
    label: "Connect",
    does: "Students relate the material to their own life, or a passage to life today.",
    ai: "The AI asks for examples from their experience and how the idea applies.",
    modes: ["liken-to-me", "liken-to-us"],
  },
  {
    key: "defend",
    label: "Defend their work",
    does: "Students add their own paper, code or plan, then explain and defend it.",
    ai: "The AI is an examiner who has read their work and asks about it.",
    modes: ["defend"],
  },
];

/** The group a mode belongs to. Every mode is in exactly one (types.test.ts). */
export function groupOf(mode: ModeSlug): TypeGroup {
  return TYPE_GROUPS.find((g) => g.modes.includes(mode))!;
}

/** The name a mode goes by inside its group's "Style" choice. */
export const styleLabel = (mode: ModeSlug) => MODES[mode].label;

/** A mode as the teacher reads it: the group, plus the style when the group has more than one ("Argue · Pitch"). */
export function typeName(mode: ModeSlug): string {
  const group = groupOf(mode);
  return group.modes.length > 1 ? `${group.label} · ${styleLabel(mode)}` : group.label;
}
