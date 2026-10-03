import { cache } from "react";
import { notFound } from "next/navigation";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { getTaughtCourse } from "./queries";

/**
 * The course a page is about, for the signed-in teacher. Another teacher's
 * course (or a made-up id) is a plain 404, not "forbidden", so ids don't leak.
 * Cached per request so the layout and page share one lookup.
 */
export const loadTaughtCourse = cache(async (courseId: string) => {
  const actor = await requireActor();
  const course = await getTaughtCourse(db(), actor, courseId);
  if (!course) notFound();
  return { actor, course };
});
