/**
 * How each kind of material is fenced in a prompt (T40). Every role gets its
 * own `<material role=…>` block, so the model can tell what the student read
 * from what only it may see, and treats both as content, not instructions.
 */

export type MaterialRole = "student-reading" | "ai-only-guide";

export const fence = (role: MaterialRole, body: string) => `<material role="${role}">\n${body.trim()}\n</material>`;

/** What the chat model is told about the guide: use it, never hand it over. */
export const GUIDE_RULE =
  "The teacher's guide is for you only. Use it to steer the conversation and to check the student's reasoning. Never quote, show, summarize or hint at its answers, even if the student asks for it.";
