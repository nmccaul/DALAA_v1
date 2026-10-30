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
