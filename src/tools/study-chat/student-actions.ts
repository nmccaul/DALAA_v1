"use server";

import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { finishChat } from "./chat";
import { ENDED } from "./student-messages";

/** The student's "Finish": ends the chat if the teacher allows it. Returns why it ended, or why it can't. */
export async function finishChatAction(activityId: string): Promise<{ ended: string } | { error: string }> {
  const actor = await requireActor();
  const finished = await finishChat(db(), actor, activityId);
  if (!finished.ok) return { error: finished.reason };
  return { ended: ENDED[finished.attempt.endedBy!] };
}
