/**
 * What teachers see the AI-only guide called (T42b, Nathan 2026-10-29). Every
 * teacher-facing label reads from here; code and tables still say "guide".
 * No server imports, so client forms can use it.
 */
export const GUIDE_LABEL = {
  name: "Additional AI instructions",
  private: "(students never see this)",
  hint: "Anything the AI should know or do: answer key, teaching notes, what a strong answer includes, mistakes to watch for, how hard to push.",
} as const;

/**
 * What "AI only" means, said once (Lucy's 1cb6be4f): the Setup tab, where the
 * term first appears, and the Materials tab's help both use this sentence.
 */
export const AI_ONLY_EXPLAINED =
  "AI-only notes are material only the AI reads; students never see them: a teaching note, an answer key, or facts the student has to find out by talking with the AI. For example, in a negotiation, the other side's bottom line and what it would settle for.";
