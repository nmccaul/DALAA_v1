"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { openDispute } from "./disputes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The student's "Dispute this grade". `clientKey` comes with the form, so sending it twice opens one dispute. */
export async function openDisputeAction(form: FormData): Promise<void> {
  const activityId = String(form.get("activityId"));
  if (!UUID.test(activityId)) redirect("/");
  // The page shows the dispute, or the one already open; an empty reason can't get past the form.
  await openDispute(
    db(),
    await requireActor(),
    String(form.get("attemptId")),
    String(form.get("reason") ?? ""),
    String(form.get("clientKey")),
  );
  revalidatePath(`/activities/${activityId}`);
  redirect(`/activities/${activityId}#your-grade`);
}
