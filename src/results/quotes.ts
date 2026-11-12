/**
 * Quotes an AI says a student wrote, for every tool: a quote is kept only if
 * the student really wrote it, never shown otherwise. A made-up quote is worse
 * than none when a student disputes a grade or a teacher reads it in class.
 */

/** Lowercased, with quote marks and runs of spaces evened out, so a faithful quote matches. */
export const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^["'\s]+|["'\s.…]+$/g, "");

/**
 * The quote if the student wrote it, else NULL. `studentWords` is `plain()` of
 * everything they wrote. Kept without the quote marks the AI wraps it in; the
 * page adds its own.
 */
export function quoted(evidence: string, studentWords: string): string | null {
  const quote = evidence.trim().replace(/^["“'‘]([^]*)["”'’]$/, "$1").trim();
  return quote !== "" && plain(quote) !== "" && studentWords.includes(plain(quote)) ? quote : null;
}
