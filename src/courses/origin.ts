import type { Db } from "@/db/types";
import type { Actor } from "@/db/scope";
import { getTaughtCourse, type CourseCard } from "./queries";

/**
 * An activity opened from another course's *From my other courses* list
 * carries that course as `?from=<courseId>`, so its page can say where the
 * teacher is and lead back (feedback 12b101b4).
 */
export const FROM_PARAM = "from";

/** A DALAA path with the course the teacher came from kept on it; unchanged when there is none. */
export function keepFrom(path: string, from: string | null): string {
  if (!from) return path;
  const url = new URL(path, "http://dalaa.local");
  url.searchParams.set(FROM_PARAM, from);
  return `${url.pathname}${url.search}`;
}

/** Back to the list the teacher opened the activity from. */
export const originListPath = (from: string) => `/courses/${from}?show=other`;

/**
 * The course the teacher came from, when `from` names a course they teach
 * other than the activity's own; null for anything else (missing, made up,
 * someone else's course, or the same course).
 */
export async function originCourse(db: Db, actor: Actor, from: unknown, courseId: string): Promise<CourseCard | null> {
  if (typeof from !== "string" || from.toLowerCase() === courseId.toLowerCase()) return null;
  return getTaughtCourse(db, actor, from);
}
