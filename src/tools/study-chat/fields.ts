/** The review screen's settings, in screen order (editor.tsx); labels come from the schema (`settingTitle`). */

/** The editor's cards, in screen order. */
export const CARD_KEYS = ["goal", "scenarios", "persona", "touchpoints", "positions", "rubric", "completion"] as const;
export type CardKey = (typeof CARD_KEYS)[number];

/** The cards to render: all of them, or only `only` (a wizard step's), still in screen order. */
export function shownCards(only?: readonly CardKey[]): CardKey[] {
  return only ? CARD_KEYS.filter((k) => only.includes(k)) : [...CARD_KEYS];
}

/**
 * Every setting the search box can jump to. `more` ones sit under "More
 * options" in their card. A top-level setting with no card of its own names
 * the `card` it sits in.
 */
export const FIELDS: { path: string[]; more?: boolean; card?: string }[] = [
  { path: ["goal"] },
  { path: ["scenarios", "title"] },
  { path: ["scenarios", "situation"] },
  { path: ["studentWork"], card: "scenarios" },
  { path: ["scenarios", "opening"] },
  { path: ["positions"] },
  { path: ["touchpoints"] },
  { path: ["showProgress"], card: "touchpoints" },
  { path: ["persona", "name"] },
  { path: ["persona", "title"] },
  { path: ["persona", "helpfulness"] },
  { path: ["persona", "background"], more: true },
  { path: ["persona", "tone"], more: true },
  { path: ["completion", "maxTurns"] },
  { path: ["completion", "minTurns"] },
  { path: ["completion", "timeLimitMinutes"] },
  { path: ["completion", "question"] },
  { path: ["completion", "studentCanFinish"] },
  { path: ["rubric", "criteria"] },
  { path: ["rubric", "strictness"], more: true },
];

export const fieldId = (path: readonly string[]) => `setting-${path.join("-")}`;

/** The card a field sits in. */
export const cardOf = (field: (typeof FIELDS)[number]) => field.card ?? field.path[0];
