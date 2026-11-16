/**
 * The parts of a Study Chat DALAA can write for the teacher, on request
 * (Nathan, feedback 04c68408 and aab2aed5, 2026-11-16): each text box, each
 * list, and each setup step's set of them. The teacher writes first if they
 * like; a part's ✨ button drafts it when it's empty and tweaks it when it
 * isn't. No server imports: the editor reads and sets parts with these too.
 */

import { z } from "zod";
import { settingTitle, StudyChatFields, type StudyChatSettings } from "./schema";

type S = StudyChatSettings;

const fields = StudyChatFields.shape;
const scenario = fields.scenarios.element.shape;
const persona = fields.persona.shape;

type Part<V> = {
  /** Where it's stored, for its label (`settingTitle`). */
  path: string[];
  /** What the model writes: the setting's own schema, so its description guides it. */
  schema: z.ZodType<V>;
  get: (s: S) => V;
  set: (s: S, value: V) => void;
};

const part = <V>(p: Part<V>) => p;

export const PARTS = {
  goal: part({ path: ["goal"], schema: fields.goal, get: (s) => s.goal, set: (s, v) => void (s.goal = v) }),
  title: part({
    path: ["scenarios", "title"],
    schema: scenario.title,
    get: (s) => s.scenarios[0].title,
    set: (s, v) => void (s.scenarios[0].title = v),
  }),
  situation: part({
    path: ["scenarios", "situation"],
    schema: scenario.situation,
    get: (s) => s.scenarios[0].situation,
    set: (s, v) => void (s.scenarios[0].situation = v),
  }),
  opening: part({
    path: ["scenarios", "opening"],
    schema: scenario.opening,
    get: (s) => s.scenarios[0].opening,
    set: (s, v) => void (s.scenarios[0].opening = v),
  }),
  personaName: part({ path: ["persona", "name"], schema: persona.name, get: (s) => s.persona.name, set: (s, v) => void (s.persona.name = v) }),
  personaRole: part({ path: ["persona", "title"], schema: persona.title, get: (s) => s.persona.title, set: (s, v) => void (s.persona.title = v) }),
  background: part({
    path: ["persona", "background"],
    schema: persona.background,
    get: (s) => s.persona.background,
    set: (s, v) => void (s.persona.background = v),
  }),
  tone: part({ path: ["persona", "tone"], schema: persona.tone, get: (s) => s.persona.tone, set: (s, v) => void (s.persona.tone = v) }),
  question: part({
    path: ["completion", "question"],
    schema: fields.completion.shape.question.unwrap(),
    get: (s) => s.completion.question ?? "",
    set: (s, v) => void (s.completion.question = v.trim() === "" ? null : v),
  }),
  touchpoints: part({ path: ["touchpoints"], schema: fields.touchpoints, get: (s) => s.touchpoints, set: (s, v) => void (s.touchpoints = v) }),
  positions: part({ path: ["positions"], schema: fields.positions, get: (s) => s.positions, set: (s, v) => void (s.positions = v) }),
  criteria: part({
    path: ["rubric", "criteria"],
    schema: fields.rubric.shape.criteria,
    get: (s) => s.rubric.criteria,
    set: (s, v) => void (s.rubric.criteria = v),
  }),
} as const;

export type PartKey = keyof typeof PARTS;

export const isPartKey = (value: unknown): value is PartKey => typeof value === "string" && Object.hasOwn(PARTS, value);

/** A list (key points, positions, criteria) rather than one box. */
export const isListPart = (key: PartKey) => PARTS[key].schema instanceof z.ZodArray;

/** The teacher's label for a part, e.g. "Opening message". */
export const partTitle = (key: PartKey) => settingTitle(PARTS[key].path);

/** Nothing written yet: an empty text or an empty list. */
export function isEmpty(s: S, key: PartKey): boolean {
  const value = PARTS[key].get(s);
  return typeof value === "string" ? value.trim() === "" : value.length === 0;
}

/** Sets each part DALAA wrote, in place. */
export function applyParts(s: S, values: Readonly<Record<string, unknown>>): void {
  for (const [key, value] of Object.entries(values)) {
    if (!isPartKey(key)) continue;
    const parsed = PARTS[key].schema.safeParse(value);
    if (parsed.success) (PARTS[key].set as (s: S, v: unknown) => void)(s, parsed.data);
  }
}

/**
 * The parts "Draft this page" fills on each setup step. Chat options has
 * none: its limits start set, and its question is optional.
 */
export const STEP_PARTS: Partial<Record<string, readonly PartKey[]>> = {
  scenario: ["title", "situation", "opening", "personaName", "personaRole", "background", "tone"],
  grading: ["touchpoints", "positions", "criteria"],
};
