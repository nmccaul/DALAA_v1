import { isCurrentTab, type Tab } from "@/components/tab-match";
import type { CourseCard } from "./queries";

/** One entry in the course switcher (e77d9cdb): another course this teacher teaches. */
export type SwitcherCourse = { id: string; name: string; term: string; isPractice: boolean };

/**
 * The courses a teacher can switch to from `currentId`: every other course
 * they teach, in the Courses page's order, practice ones included. Empty
 * when this is their only course, so the name shows without a menu.
 */
export function switchableCourses(courses: readonly CourseCard[], currentId: string): SwitcherCourse[] {
  return courses
    .filter((c) => c.id !== currentId)
    .map((c) => ({ id: c.id, name: c.code || c.title, term: c.term, isPractice: c.isPractice }));
}

/**
 * Where picking course `toId` goes from `path`: the top of the same tab in
 * that course (a results page opens its Results, a material its Materials),
 * or its Activities tab when `path` is on no tab. `tabs` are the current
 * course's, all under `fromBase`.
 */
export function switchHref(tabs: readonly Tab[], path: string, fromBase: string, toId: string): string {
  const toBase = `/courses/${toId}`;
  const tab = tabs.find((t) => isCurrentTab(t, path));
  if (!tab || !(tab.href === fromBase || tab.href.startsWith(`${fromBase}/`))) return toBase;
  return toBase + tab.href.slice(fromBase.length);
}
