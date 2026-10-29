import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTakenActivity } from "@/attempts/store";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { screensFor } from "@/tools/screens";

export const metadata: Metadata = { title: "Assignment" };

/** A tool may grade a finished attempt after the page is sent (`after`); that call needs the time. */
export const maxDuration = 120;

/** One assignment for a student of its course: the tool's own student screen (src/tools/screens.ts). */
export default async function TakeActivityPage({ params }: PageProps<"/activities/[activityId]">) {
  const { activityId } = await params;
  const actor = await requireActor();
  const activity = await getTakenActivity(db(), actor, activityId);
  if (!activity) notFound();
  const screens = screensFor(activity.tool);
  if (!screens) notFound();
  const Take = screens.take;

  return <Take actor={actor} activity={activity} />;
}
