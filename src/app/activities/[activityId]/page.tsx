import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTakenActivity, studentHomePath } from "@/attempts/store";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { screensFor } from "@/tools/screens";

export const metadata: Metadata = { title: "Assignment" };

/** A tool may grade a finished attempt after the page is sent (`after`); that call needs the time. */
export const maxDuration = 120;

/**
 * One assignment for a student of its course: the tool's own student screen
 * (src/tools/screens.ts), under the way back to the course's assignments and,
 * for a real Canvas course, to Canvas.
 */
export default async function TakeActivityPage({ params }: PageProps<"/activities/[activityId]">) {
  const { activityId } = await params;
  const actor = await requireActor();
  const activity = await getTakenActivity(db(), actor, activityId);
  if (!activity) notFound();
  const screens = screensFor(activity.tool);
  if (!screens) notFound();
  const Take = screens.take;

  return (
    <>
      <nav className="-mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <Link href={studentHomePath(activity.courseId)} className="text-muted hover:text-text">
          ← Your assignments
        </Link>
        {activity.canvasCourseUrl && (
          <a href={activity.canvasCourseUrl} className="text-muted hover:text-text">
            Back to Canvas
          </a>
        )}
      </nav>
      <Take actor={actor} activity={activity} />
    </>
  );
}
