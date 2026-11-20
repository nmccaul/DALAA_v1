"use server";

import { redirect } from "next/navigation";
import { copyActivity } from "@/activities/copy";
import { deleteActivity } from "@/activities/delete";
import { requireActor } from "@/auth/current";
import type { DeleteState } from "@/components/confirm-delete";
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

/**
 * The trash button on an Activities row, after the teacher confirms (D-041).
 * `confirmed` is the "delete the students' work too" box; it's required only
 * once a student has started.
 */
export async function deleteActivityAction(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  const deleted = await deleteActivity(db(), await requireActor(), String(form.get("activityId") ?? ""), form.get("confirmed") === "1");
  if (!deleted.ok) return { error: deleted.reason };
  const show = form.get("show") === "assigned" ? "assigned" : "unassigned";
  redirect(`/courses/${deleted.courseId}?show=${show}&deleted=1`);
}
