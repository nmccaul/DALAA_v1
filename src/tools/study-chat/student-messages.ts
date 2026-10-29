/** What a Study Chat tells the student when it ends or a reply fails. No server imports: the chat page shows these too. */

import type { EndedBy } from "@/attempts/store";

export const ENDED: Readonly<Record<EndedBy, string>> = {
  turns: "This chat has ended: you've used all your messages.",
  time: "This chat has ended: time's up.",
  question: "This chat has ended: you've answered the question.",
  student: "You've finished this chat.",
};

export const REPLY_FAILED = "The reply didn't come through. Send your message again; it won't count against you.";
