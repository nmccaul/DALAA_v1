/** The Activities tab's switch (feedback 33bd9f39): Assigned · Not assigned · From my other courses. */

export type ActivitiesView = "assigned" | "unassigned" | "other";

/**
 * Which list the Activities tab shows: the one asked for (?show=), else the
 * first that has anything in it — Assigned, then Not assigned, then other
 * courses — so the tab never opens on an empty list when something exists.
 */
export function activitiesView(
  show: string | string[] | undefined,
  counts: { assigned: number; notAssigned: number; other: number },
): ActivitiesView {
  if (show === "assigned" || show === "unassigned" || show === "other") return show;
  if (counts.assigned > 0) return "assigned";
  if (counts.notAssigned > 0) return "unassigned";
  return counts.other > 0 ? "other" : "assigned";
}
