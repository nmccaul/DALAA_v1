import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteImpact } from "@/activities/delete";
import { getTaughtActivity } from "@/activities/store";
import { loadTaughtCourse } from "@/courses/load";
import { FROM_PARAM, originCourse, originListPath } from "@/courses/origin";
import { PICKER_PARAM, pickerRequest } from "@/lti/picker";
import { db } from "@/db/client";
import { activityListPath } from "@/tools/catalog";
import { screensFor } from "@/tools/screens";
import { DeleteActivity } from "../../../../delete-activity";
import { OriginBanner } from "../../origin-banner";

export const metadata: Metadata = { title: "Set up activity" };

/** Step 7's practice run has a whole chat, then grades it: the same limit as the review screen (feedback 1e337d7f). */
export const maxDuration = 300;

/** One step of a drafted activity's setup wizard: the tool's own screen (src/tools/screens.ts). */
export default async function SetupStepPage({ params, searchParams }: PageProps<"/courses/[courseId]/activities/[activityId]/setup/[step]">) {
  const { courseId, activityId, step } = await params;
  const { actor, course } = await loadTaughtCourse(courseId);
  const activity = await getTaughtActivity(db(), actor, activityId);
  if (!activity || activity.courseId !== course.id) notFound();
  const Setup = screensFor(activity.tool)?.setup;
  if (!Setup) notFound();
  const query = await searchParams;
  // Opened from another course's list (feedback 12b101b4), as on the activity's page.
  const origin = await originCourse(db(), actor, query[FROM_PARAM], course.id);
  const impact = await deleteImpact(db(), activity.id);

  return (
    <div className="flex flex-col gap-6">
      {/* Delete sits up here, away from Next (feedback 9689e37b). */}
      <div className="-mb-2 flex items-center justify-between gap-4">
        <Link href={origin ? originListPath(origin.id) : activityListPath(course.id, activity)} className="text-sm text-accent-text hover:underline">
          ‹ Activities
        </Link>
        <DeleteActivity activity={{ ...activity, ...impact }} label="Delete activity" />
      </div>
      {origin && <OriginBanner here={course} origin={origin} />}
      <Setup actor={actor} activity={activity} step={step} addToCanvas={pickerRequest(query[PICKER_PARAM])} searchParams={{ ...query, [FROM_PARAM]: origin?.id }} />
    </div>
  );
}
