import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTaughtActivity } from "@/activities/store";
import { loadTaughtCourse } from "@/courses/load";
import { PICKER_PARAM, pickerRequest } from "@/lti/picker";
import { db } from "@/db/client";
import { screensFor } from "@/tools/screens";

export const metadata: Metadata = { title: "Assignment" };

/** A review screen's actions can run long: Study Chat's sample student has a whole chat, then grades it. */
export const maxDuration = 300;

/** One assignment for its teacher: the tool's own review screen (src/tools/screens.ts). */
export default async function ActivityPage({ params, searchParams }: PageProps<"/courses/[courseId]/activities/[activityId]">) {
  const { courseId, activityId } = await params;
  const { actor, course } = await loadTaughtCourse(courseId);
  const activity = await getTaughtActivity(db(), actor, activityId);
  if (!activity || activity.courseId !== course.id) notFound();
  const screens = screensFor(activity.tool);
  if (!screens) notFound();
  const Review = screens.review;

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/courses/${course.id}`} className="-mb-2 text-sm text-muted hover:text-text">
        ← All assignments
      </Link>
      <Review actor={actor} activity={activity} addToCanvas={pickerRequest((await searchParams)[PICKER_PARAM])} />
    </div>
  );
}
