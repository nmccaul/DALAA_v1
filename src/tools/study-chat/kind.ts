/**
 * The kind of Study Chat an activity is, for lists outside the tool (the
 * Activities tab, feedback 93c4ef12 / 04dcbd11): the wizard's group icon and
 * name, from the mode its settings store. NULL for a draft that has no kind
 * yet (or settings that don't name a known one).
 */

import type { ActivityKind } from "../kind";
import { MODE_SLUGS, type ModeSlug } from "./modes";
import { groupOf, typeName } from "./wizard/types";

export function studyChatKind(settings: Record<string, unknown>): ActivityKind | null {
  const mode = settings.mode;
  if (typeof mode !== "string" || !(MODE_SLUGS as readonly string[]).includes(mode)) return null;
  return { label: typeName(mode as ModeSlug), icon: groupOf(mode as ModeSlug).icon };
}
