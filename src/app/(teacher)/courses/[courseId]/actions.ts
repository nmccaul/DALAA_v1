"use server";

import { redirect } from "next/navigation";
import { copyActivity } from "@/activities/copy";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";

/**
 * "Copy" and "Copy to this course" on the Activities tab: copies the activity
 * into this course as a draft and opens the copy. `creationKey` is
 * client-generated, so a double click makes one copy.
 */
export async function copyActivityAction(form: FormData): Promise<void> {
  const courseId = String(form.get("courseId") ?? "");
  const copied = await copyActivity(
    db(),
    await requireActor(),
    String(form.get("activityId") ?? ""),
    courseId,
    String(form.get("creationKey") ?? ""),
  );
  // A fixed message on the page, not the reason in the URL: anyone could put text there.
  if (!copied.ok) redirect(`/courses/${courseId}?copyerror=1`);
  redirect(`/courses/${courseId}/activities/${copied.id}`);
}
