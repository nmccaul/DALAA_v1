"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/auth/current";
import { connectPractice, connectWithToken, disconnect } from "@/canvas/connection";
import { db } from "@/db/client";

export type ConnectState = { error?: string };

const MESSAGES = {
  empty: "Paste your token first.",
  rejected: "Canvas didn't accept that token. Copy it again from Canvas, making sure you get the whole thing.",
  unavailable: "We couldn't reach Canvas just now. Try again in a minute.",
} as const;

/** Only same-site paths, so ?next= can't send a teacher off-site. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/settings";
}

export async function connectWithTokenAction(_prev: ConnectState, form: FormData): Promise<ConnectState> {
  const actor = await requireActor();
  const result = await connectWithToken(db(), actor, String(form.get("token") ?? ""));
  if (!result.ok) return { error: MESSAGES[result.reason] };
  revalidatePath("/settings");
  redirect(safeNext(form.get("next")));
}

export async function choosePracticeCanvasAction(form: FormData): Promise<void> {
  await connectPractice(db(), await requireActor());
  revalidatePath("/settings");
  redirect(safeNext(form.get("next")));
}

export async function disconnectCanvasAction(): Promise<void> {
  await disconnect(db(), await requireActor());
  revalidatePath("/settings");
}
