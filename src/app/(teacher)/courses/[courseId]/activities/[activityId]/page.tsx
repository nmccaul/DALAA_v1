import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTaughtActivity } from "@/activities/store";
import { loadTaughtCourse } from "@/courses/load";
import { FROM_PARAM, keepFrom, originCourse, originListPath } from "@/courses/origin";
import { PICKER_PARAM, pickerRequest } from "@/lti/picker";
import { db } from "@/db/client";
import { ButtonLink } from "@/components/ui";
import { activityListPath, editActivityPath } from "@/tools/catalog";
import { screensFor } from "@/tools/screens";
import { OriginBanner } from "./origin-banner";

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
  const query = await searchParams;
  // Opened from another course's *From my other courses*: say so, and lead back there (feedback 12b101b4).
  const origin = await originCourse(db(), actor, query[FROM_PARAM], course.id);
  const edit = editActivityPath(course.id, activity);

  return (
    <div className="flex flex-col gap-6">
      <div className="-mb-2 flex flex-wrap items-center justify-between gap-3">
        <Link href={origin ? originListPath(origin.id) : activityListPath(course.id, activity)} className="text-sm text-accent-text hover:underline">
          ‹ Activities
        </Link>
        {edit !== `/courses/${course.id}/activities/${activity.id}` && (
          <ButtonLink href={keepFrom(edit, origin?.id ?? null)} variant="secondary" className="text-sm">
            Edit in the wizard
          </ButtonLink>
        )}
      </div>
      {origin && <OriginBanner here={course} origin={origin} />}
      <Review actor={actor} activity={activity} addToCanvas={pickerRequest(query[PICKER_PARAM])} />
    </div>
  );
}
