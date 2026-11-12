import type { Db } from "@/db/types";
import type { ConversationText } from "@/tools/screens";
import { doneTurns } from "./chat";

/** A finished chat as plain text, for the class-prep brief (src/results/brief.ts). */
export async function studyChatConversation(db: Db, attemptId: string): Promise<ConversationText> {
  const turns = await doneTurns(db, attemptId);
  return {
    text: turns.map((t) => `Student: ${t.message}\nAI: ${t.reply}`).join("\n\n"),
    studentWords: turns.map((t) => t.message).join("\n"),
  };
}
