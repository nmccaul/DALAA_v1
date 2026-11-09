/**
 * The files DALAA reads (src/content/read.ts), in one place for the reader and
 * every upload form. No server imports, so client forms can use it.
 */

export const FILE_TYPES = ["pdf", "docx", "pptx", "txt", "md"] as const;

/** For `<input type="file" accept>`. */
export const FILE_ACCEPT = FILE_TYPES.map((t) => `.${t}`).join(",");

/** How forms and refusals name them. */
export const FILE_TYPES_LABEL = "a PDF, Word (.docx), PowerPoint (.pptx), .txt or .md file";

/** "a PDF…" → "A PDF…", for the start of a sentence. */
export const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
