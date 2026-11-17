import type { Db } from "@/db/types";
import type { ConversationText } from "@/tools/screens";
import { doneTurns } from "./chat";

/**
 * How much of each AI reply the class-prep brief reads. The students' words
 * are what it's about; the AI's reply is context, and cutting it roughly
 * halves what a brief costs (D-035, 2026-11-16).
 */
export const AI_REPLY_CHARS = 300;

/** Long text cut at a word to about `max` characters, marked with "…". Exported for tests. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A finished chat as plain text, for the class-prep brief (src/results/brief.ts): the student's words whole, the AI's cut short. */
export async function studyChatConversation(db: Db, attemptId: string): Promise<ConversationText> {
  const turns = await doneTurns(db, attemptId);
  return {
    text: turns.map((t) => `Student: ${t.message}\nAI: ${clip(t.reply, AI_REPLY_CHARS)}`).join("\n\n"),
    studentWords: turns.map((t) => t.message).join("\n"),
  };
}
