/**
 * Turns what a teacher gives us — pasted text, or a .txt, .md or .pdf file —
 * into the plain text students read and the AI drafts from.
 *
 * Pure: no database. Every refusal is a sentence the teacher can act on.
 */

import { extractText, getDocumentProxy } from "unpdf";

/** Under Vercel's 4.5 MB request body limit, so the refusal is ours, not a 413. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** About 40 pages: enough for a case or a chapter, and it fits a model's prompt. */
export const MAX_CHARS = 100_000;

export type ContentInput =
  | { kind: "paste"; name: string; text: string }
  | { kind: "file"; name: string; bytes: Uint8Array };

export type ReadContent =
  | { ok: true; source: "paste" | "upload"; name: string; body: string }
  | { ok: false; reason: string };

const FILE_TYPES = ["txt", "md", "pdf"] as const;

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** One shape for every source: Unix line ends, no NULs (Postgres refuses them), no runs of blank lines. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function finish(source: "paste" | "upload", name: string, raw: string): ReadContent {
  const body = cleanText(raw);
  if (!body) {
    return {
      ok: false,
      reason: source === "paste" ? "Paste the text students should read." : `${name} has no text in it.`,
    };
  }
  if (body.length > MAX_CHARS) {
    return {
      ok: false,
      reason: `That's ${body.length.toLocaleString("en-US")} characters; the limit is ${MAX_CHARS.toLocaleString("en-US")} (about 40 pages). Use a shorter excerpt.`,
    };
  }
  return { ok: true, source, name, body };
}

async function pdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    // pdf.js takes ownership of the buffer it's given; hand it a copy.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    return null;
  }
}

export async function readContent(input: ContentInput): Promise<ReadContent> {
  const name = input.name.trim();

  if (input.kind === "paste") return finish("paste", name || "Pasted text", input.text);

  if (!name) return { ok: false, reason: "That file has no name." };
  const ext = extension(name);
  if (!(FILE_TYPES as readonly string[]).includes(ext)) {
    return { ok: false, reason: `${name} isn't a file DALAA can read. Use a .pdf, .txt or .md file, or paste the text.` };
  }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `${name} is over 4 MB. Use a smaller file, or paste the part students need.` };
  }

  if (ext === "pdf") {
    const isPdf = new TextDecoder("latin1").decode(input.bytes.subarray(0, 5)) === "%PDF-";
    const text = isPdf ? await pdfText(input.bytes) : null;
    if (text === null) return { ok: false, reason: `We couldn't read ${name}. It may be damaged or password-protected.` };
    if (!cleanText(text)) {
      return { ok: false, reason: `${name} has no text we can read; it may be a scan. Paste the text instead.` };
    }
    return finish("upload", name, text);
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
  } catch {
    return { ok: false, reason: `${name} isn't plain text. Save it as UTF-8 text, or paste it.` };
  }
  return finish("upload", name, text.replace(/^﻿/, ""));
}
