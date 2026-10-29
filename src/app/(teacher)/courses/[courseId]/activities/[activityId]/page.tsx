import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTaughtActivity } from "@/activities/store";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { screensFor } from "@/tools/screens";

export const metadata: Metadata = { title: "Assignment" };

/** One assignment for its teacher: the tool's own review screen (src/tools/screens.ts). */
export default async function ActivityPage({ params }: PageProps<"/courses/[courseId]/activities/[activityId]">) {
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
      <Review actor={actor} activity={activity} />
    </div>
  );
}
