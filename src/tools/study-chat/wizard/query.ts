/**
 * The wizard's URLs: which saved materials are ticked, carried in the query
 * until the draft exists (ralph/PLAN.md). No server imports, so step 1's
 * client form can build its links from the boxes ticked right now.
 */

import { keepPicker } from "@/lti/picker";

export type MaterialIds = { contentIds: string[]; guideIds: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The picks as the query the next steps carry: `content=a,b&guide=c`. */
export function materialsQuery({ contentIds, guideIds }: MaterialIds): string {
  const query = new URLSearchParams({ content: contentIds.join(",") });
  if (guideIds.length > 0) query.set("guide", guideIds.join(","));
  return query.toString();
}

/**
 * The picks a wizard URL carries (malformed ids dropped), e.g. to keep them
 * ticked on Back. A material just added from step 1 comes back as
 * `added=content:<id>` or `added=guide:<id>` and counts as ticked too.
 */
export function materialsFromQuery(searchParams: Record<string, string | string[] | undefined>): MaterialIds {
  const ids = (key: string) => {
    const value = searchParams[key];
    return typeof value === "string" ? value.split(",").map((id) => id.toLowerCase()).filter((id) => UUID.test(id)) : [];
  };
  const picked = { contentIds: ids("content"), guideIds: ids("guide") };
  const added = typeof searchParams.added === "string" ? savedIds([searchParams.added]) : { contentIds: [], guideIds: [] };
  return {
    contentIds: [...new Set([...picked.contentIds, ...added.contentIds])],
    guideIds: [...new Set([...picked.guideIds, ...added.guideIds])],
  };
}

/** The saved materials among ticked checkbox values (`content:<id>`, `guide:<id>`); Canvas items and junk are left out. */
export function savedIds(values: readonly string[]): MaterialIds {
  const out: MaterialIds = { contentIds: [], guideIds: [] };
  for (const value of values) {
    const [kind, id = ""] = value.split(":");
    const lower = id.toLowerCase();
    if (!UUID.test(lower)) continue;
    const list = kind === "content" ? out.contentIds : kind === "guide" ? out.guideIds : null;
    if (list && !list.includes(lower)) list.push(lower);
  }
  return out;
}

/** Step 1 with these materials ticked. */
export function materialsStepPath(courseId: string, ids: MaterialIds, picker: string | null): string {
  const query = ids.contentIds.length + ids.guideIds.length > 0 ? `&${materialsQuery(ids)}` : "";
  return keepPicker(`/courses/${courseId}/activities/new/study-chat?step=materials${query}`, picker);
}

export type AddKind = "upload" | "paste" | "web";

/** Add a material from step 1, coming back to step 1 with what was ticked (and the new material) afterwards. */
export function addMaterialPath(courseId: string, kind: AddKind, ids: MaterialIds, picker: string | null): string {
  const next = materialsStepPath(courseId, ids, picker);
  return `/courses/${courseId}/materials/new?kind=${kind}&next=${encodeURIComponent(next)}`;
}

/** "About how long?" on step 2, passed to drafting as a hint. */
export const MINUTES = [
  // Very short chats, e.g. a quick demo or a warm-up (feedback 906b03ff).
  { value: "2-5", label: "2–5 minutes" },
  { value: "5-10", label: "5–10 minutes" },
  { value: "10-15", label: "10–15 minutes" },
  { value: "20-30", label: "20–30 minutes" },
  { value: "45+", label: "45 minutes or more" },
] as const;

export type Minutes = (typeof MINUTES)[number]["value"];

/** The longest goal the URL carries: one or two sentences, with room to spare. */
const MAX_GOAL_URL_CHARS = 1000;

/**
 * Step 2's answers as a later step's URL carries them: the teacher's goal
 * (null until they've been through step 2) and the length hint.
 */
export function goalFromQuery(searchParams: Record<string, string | string[] | undefined>): { goal: string | null; minutes: Minutes | null } {
  const goal = typeof searchParams.goal === "string" ? searchParams.goal.trim().slice(0, MAX_GOAL_URL_CHARS) : "";
  const minutes = MINUTES.find((m) => m.value === searchParams.minutes)?.value ?? null;
  return { goal: goal === "" ? null : goal, minutes };
}

/** Step 2 with these materials ticked, and the teacher's goal and length kept when they come back to it. */
export function goalStepPath(
  courseId: string,
  ids: MaterialIds,
  answers: { goal: string | null; minutes: Minutes | null },
  picker: string | null,
): string {
  const query = new URLSearchParams(materialsQuery(ids));
  if (answers.goal) query.set("goal", answers.goal);
  if (answers.minutes) query.set("minutes", answers.minutes);
  return keepPicker(`/courses/${courseId}/activities/new/study-chat?step=goal&${query}`, picker);
}
