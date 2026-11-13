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
  /** The modes in this group, the usual one first. Two or more show a "Style" choice. */
  modes: readonly ModeSlug[];
};

export const TYPE_GROUPS: readonly TypeGroup[] = [
  { key: "explain", label: "Explain / teach back", does: "Students explain the idea in their own words to a curious beginner.", modes: ["explain"] },
  { key: "apply", label: "Apply", does: "Students use the material on a new problem or a case and recommend what to do.", modes: ["apply", "case-chat"] },
  { key: "argue", label: "Argue", does: "Students take a position or pitch an idea and defend it against pushback.", modes: ["debate", "pitch"] },
  { key: "question", label: "Question", does: "Students have their reasoning and assumptions probed until they think it through.", modes: ["socratic"] },
  {
    key: "practice",
    label: "Practice a conversation",
    does: "Students rehearse a real conversation: an interview, a negotiation, a hard talk.",
    modes: ["roleplay", "interview"],
  },
  { key: "connect", label: "Connect", does: "Students relate the material to their own life, or a passage to life today.", modes: ["liken-to-me", "liken-to-us"] },
  { key: "defend", label: "Defend their work", does: "Students add their own paper, code or plan, then answer an examiner's questions about it.", modes: ["defend"] },
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
