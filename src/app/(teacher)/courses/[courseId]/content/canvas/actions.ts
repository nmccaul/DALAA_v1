"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/auth/current";
import { clientFor } from "@/canvas/connection";
import { saveFromCanvas, type CanvasPick } from "@/canvas/content";
import { setActivityGuide } from "@/activities/store";
import { VaultError } from "@/canvas/vault";
import { db } from "@/db/client";
import { afterPick } from "./return-path";

export type PickState = { error?: string; reconnect?: boolean };

function pickFrom(value: string): CanvasPick | null {
  const [kind, ...rest] = value.split(":");
  const ref = rest.join(":");
  if (kind === "page" && ref) return { kind: "page", url: ref };
  if (kind === "file" && /^\d+$/.test(ref)) return { kind: "file", id: Number(ref) };
  return null;
}

export async function pickFromCanvasAction(_prev: PickState, form: FormData): Promise<PickState> {
  const actor = await requireActor();
  const courseId = String(form.get("courseId") ?? "");
  const pick = pickFrom(String(form.get("pick") ?? ""));
  if (!pick) return { error: "Pick a page or a file." };

  const canvas = await clientFor(db(), actor).catch((e) => {
    if (e instanceof VaultError) return null;
    throw e;
  });
  if (!canvas) return { error: "Connect Canvas again, then pick it.", reconnect: true };

  // A guide only the AI reads (?for=guide); with an activity, it's attached to it straight away.
  const as = form.get("for") === "guide" ? "guide" : "content";
  const saved = await saveFromCanvas(db(), actor, canvas, courseId, String(form.get("creationKey") ?? ""), pick, as);
  if (!saved.ok) return { error: saved.reason, reconnect: saved.reconnect };
  const activityId = form.get("activity");
  if (as === "guide" && typeof activityId === "string" && activityId) {
    const attached = await setActivityGuide(db(), actor, activityId, saved.content.id);
    if (!attached.ok) return { error: attached.reason };
  }
  redirect(afterPick(courseId, form.get("next"), saved.content.id, as));
}
