"use server";

import { after } from "next/server";
import { graderModel } from "@/ai/models";
import { requireActor } from "@/auth/current";
import { db } from "@/db/client";
import { finishChat } from "./chat";
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
