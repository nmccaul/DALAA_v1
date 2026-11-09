"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { assignActivity, assignRequestFrom, assignToCanvasOn } from "@/activities/assign";
import { requireActor } from "@/auth/current";
import { clientFor } from "@/canvas/connection";
import { db } from "@/db/client";
import { appUrlFromHeaders } from "@/lti/config";

export type AssignState = { error?: string; connect?: boolean };

/**
 * Assign (and the due-date edit): makes or updates the activity's Canvas
 * assignment, then back to the Activities tab. A refusal stays on the form.
 */
export async function assignAction(_prev: AssignState, form: FormData): Promise<AssignState> {
  if (!assignToCanvasOn()) return { error: "Assigning from DALAA isn't turned on yet." };
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const request = assignRequestFrom(form);
  if ("error" in request) return { error: request.error };

  // A token that can't be read is the same as no connection here: connect again.
  const canvas = await clientFor(db(), actor).catch(() => null);
  const assigned = await assignActivity(
    db(),
    actor,
    canvas,
    String(form.get("activityId") ?? ""),
    request,
    appUrlFromHeaders(await headers()),
  );
  if (!assigned.ok) {
    return { error: assigned.reason, connect: assigned.problem === "connect" || assigned.problem === "reconnect" };
  }
  redirect(`/courses/${courseId}`);
}
