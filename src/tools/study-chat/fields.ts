/** The review screen's settings, in screen order (editor.tsx); labels come from the schema (`settingTitle`). */

/** Every setting the search box can jump to. `more` ones sit under "More options" in their card. */
export const FIELDS: { path: string[]; more?: boolean }[] = [
  { path: ["goal"] },
  { path: ["scenarios", "title"] },
  { path: ["scenarios", "situation"] },
  { path: ["scenarios", "opening"], more: true },
  { path: ["positions"] },
  { path: ["touchpoints"] },
  { path: ["persona", "name"] },
  { path: ["persona", "title"] },
  { path: ["persona", "helpfulness"] },
  { path: ["persona", "background"], more: true },
  { path: ["persona", "tone"], more: true },
  { path: ["completion", "maxTurns"] },
  { path: ["completion", "timeLimitMinutes"] },
  { path: ["completion", "question"] },
  { path: ["completion", "studentCanFinish"] },
  { path: ["rubric", "criteria"] },
  { path: ["rubric", "strictness"], more: true },
];

export const fieldId = (path: readonly string[]) => `setting-${path.join("-")}`;
