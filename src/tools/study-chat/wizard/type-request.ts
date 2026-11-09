/**
 * Step 3's form as `createStudyChat` takes it: the picks and goal carried
 * from steps 1–2, the chosen type, and the reason only when the chosen card
 * was one the AI suggested. Pure, so the action's parsing is tested alone.
 */

import { MODE_SLUGS, MODES, type ModeSlug } from "../modes";
import { MAX_REASON_CHARS } from "../suggest";
import { goalFromQuery, materialsFromQuery, type MaterialIds, type Minutes } from "./query";

/** The hidden field carrying a suggested card's reason: `reason-<slug>`. */
export const reasonField = (mode: ModeSlug) => `reason-${mode}`;

export type TypeRequest =
  | {
      ok: true;
      ids: MaterialIds;
      goal: string;
      minutes: Minutes | null;
      mode: ModeSlug;
      typeReason: string | null;
      studentWork: boolean;
      creationKey: string;
    }
  | { ok: false; reason: string };

export function typeRequestFrom(form: FormData): TypeRequest {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : undefined;
  };
  const ids = materialsFromQuery({ content: text("content"), guide: text("guide") });
  if (ids.contentIds.length === 0) return { ok: false, reason: "Pick at least one material students read. Go back to step 1." };
  const { goal, minutes } = goalFromQuery({ goal: text("goal"), minutes: text("minutes") });
  if (!goal) return { ok: false, reason: "Write the learning goal first. Go back to step 2." };
  const mode = MODE_SLUGS.find((slug) => slug === text("mode"));
  if (!mode) return { ok: false, reason: "Pick a type of activity." };
  const creationKey = text("creationKey") ?? "";
  if (creationKey === "") return { ok: false, reason: "Reload the page and try again." };

  const reason = (text(reasonField(mode)) ?? "").trim().replace(/\s+/g, " ");
  return {
    ok: true,
    ids,
    goal,
    minutes,
    mode,
    typeReason: reason === "" ? null : reason.slice(0, MAX_REASON_CHARS),
    // Step 5 is where the teacher sets it; a mode about the student's own work always needs it.
    studentWork: MODES[mode].needsStudentWork,
    creationKey,
  };
}
