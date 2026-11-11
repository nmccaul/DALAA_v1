import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTaughtActivity } from "@/activities/store";
import { loadTaughtCourse } from "@/courses/load";
import { PICKER_PARAM, pickerRequest } from "@/lti/picker";
import { db } from "@/db/client";
import { screensFor } from "@/tools/screens";

export const metadata: Metadata = { title: "Set up activity" };

/** One step of a drafted activity's setup wizard: the tool's own screen (src/tools/screens.ts). */
export default async function SetupStepPage({ params, searchParams }: PageProps<"/courses/[courseId]/activities/[activityId]/setup/[step]">) {
  const { courseId, activityId, step } = await params;
  const { actor, course } = await loadTaughtCourse(courseId);
  const activity = await getTaughtActivity(db(), actor, activityId);
  if (!activity || activity.courseId !== course.id) notFound();
  const Setup = screensFor(activity.tool)?.setup;
  if (!Setup) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/courses/${course.id}`} className="-mb-2 text-sm text-accent-text hover:underline">
        ‹ Activities
      </Link>
      <Setup actor={actor} activity={activity} step={step} addToCanvas={pickerRequest((await searchParams)[PICKER_PARAM])} />
    </div>
  );
}
