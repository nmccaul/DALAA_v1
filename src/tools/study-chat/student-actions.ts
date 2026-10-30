"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { graderModel } from "@/ai/models";
import { takePath } from "@/attempts/store";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { addWork, finishChat } from "./chat";
import { gradeAttempt } from "./grade";
import { ENDED } from "./student-messages";

/** The student's "Finish": ends the chat if the teacher allows it, then grades it. Returns why it ended, or why it can't. */
export async function finishChatAction(activityId: string): Promise<{ ended: string } | { error: string }> {
  const actor = await requireActor();
  const finished = await finishChat(db(), actor, activityId);
  if (!finished.ok) return { error: finished.reason };
  const attemptId = finished.attempt.id;
  after(() => gradeAttempt(db(), graderModel(), attemptId));
  return { ended: ENDED[finished.attempt.endedBy!] };
}

/** The student's own work, uploaded or pasted, before the chat starts. Back to the chat once it's kept. */
export async function addWorkAction(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const actor = await requireActor();
  const activityId = String(form.get("activityId") ?? "");
  const file = form.get("file");
  const input =
    file instanceof File && file.size > 0
      ? { kind: "file" as const, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
      : { kind: "paste" as const, name: String(form.get("name") ?? "") || "My work", text: String(form.get("text") ?? "") };
  const added = await addWork(db(), actor, activityId, input);
  if (!added.ok) return { error: added.reason };
  redirect(takePath(activityId));
}
