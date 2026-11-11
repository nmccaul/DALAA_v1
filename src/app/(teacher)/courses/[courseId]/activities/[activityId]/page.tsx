import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTaughtActivity } from "@/activities/store";
import { loadTaughtCourse } from "@/courses/load";
import { PICKER_PARAM, pickerRequest } from "@/lti/picker";
import { db } from "@/db/client";
import { ButtonLink } from "@/components/ui";
import { editActivityPath } from "@/tools/catalog";
import { screensFor } from "@/tools/screens";

export const metadata: Metadata = { title: "Activity" };

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
      <div className="-mb-2 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/courses/${course.id}`} className="text-sm text-accent-text hover:underline">
          ‹ Activities
        </Link>
        {editActivityPath(course.id, activity) !== `/courses/${course.id}/activities/${activity.id}` && (
          <ButtonLink href={editActivityPath(course.id, activity)} variant="secondary" className="text-sm">
            Edit in the wizard
          </ButtonLink>
        )}
      </div>
      <Review actor={actor} activity={activity} addToCanvas={pickerRequest((await searchParams)[PICKER_PARAM])} />
    </div>
  );
}
