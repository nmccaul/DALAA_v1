"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { clientFor } from "@/canvas/connection";
import { linkToCanvas, syncRoster, type SyncResult } from "@/canvas/sync";
import { VaultError } from "@/canvas/vault";
import { db } from "@/db/client";

async function canvasOrConnect(courseId: string) {
  const canvas = await clientFor(db(), await requireActor()).catch((e) => {
    if (e instanceof VaultError) return null;
    throw e;
  });
  if (!canvas) redirect(`/canvas/connect?next=/courses/${courseId}/students`);
  return canvas;
}

function report(courseId: string, result: SyncResult): never {
  // The course header (student count, Practice label) lives in a shared layout.
  revalidatePath(`/courses/${courseId}`, "layout");
  if (!result.ok) redirect(`/courses/${courseId}/students?syncerror=${result.reason}`);
  const q = new URLSearchParams({ synced: "1" });
  for (const key of ["added", "returned", "flagged", "moved"] as const) if (result[key]) q.set(key, String(result[key]));
  redirect(`/courses/${courseId}/students?${q}`);
}

export async function syncAction(form: FormData): Promise<void> {
  const courseId = String(form.get("courseId"));
  const actor = await requireActor();
  report(courseId, await syncRoster(db(), actor, await canvasOrConnect(courseId), courseId));
}

export async function linkAction(form: FormData): Promise<void> {
  const courseId = String(form.get("courseId"));
  const actor = await requireActor();
  const canvas = await canvasOrConnect(courseId);
  report(courseId, await linkToCanvas(db(), actor, canvas, courseId, Number(form.get("canvasCourseId"))));
}
