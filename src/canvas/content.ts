/**
 * Course content from Canvas: the pages and files a teacher can pick, and the
 * picked one fetched as a `ContentInput` for `saveContent` (src/content/).
 * Reads from Canvas only. Every refusal is a sentence the teacher can act on.
 */

import { isReadableFile, MAX_UPLOAD_BYTES, type ContentInput } from "@/content/read";
import { CanvasError, type CanvasClient, type CanvasFile, type CanvasPage } from "./client";

export type CanvasContentList = { pages: CanvasPage[]; files: CanvasFile[] };

export type FetchedContent =
  | { ok: true; input: ContentInput }
  | { ok: false; reason: string; reconnect: boolean };

/** The course's pages, and only the files DALAA can read (.pdf, .txt, .md). */
export async function listCanvasContent(client: CanvasClient, courseId: number): Promise<CanvasContentList> {
  const [pages, files] = await Promise.all([client.pages(courseId), client.files(courseId)]);
  return { pages, files: files.filter((f) => isReadableFile(f.display_name) || isReadableFile(f.filename)) };
}

export async function fetchCanvasPage(client: CanvasClient, courseId: number, pageUrl: string): Promise<FetchedContent> {
  try {
    const page = await client.page(courseId, pageUrl);
    return { ok: true, input: { kind: "canvas-page", name: page.title, html: page.body ?? "" } };
  } catch (e) {
    return refusal(e, "That page");
  }
}

export async function fetchCanvasFile(client: CanvasClient, courseId: number, fileId: number): Promise<FetchedContent> {
  try {
    const file = await client.file(courseId, fileId);
    // display_name is what the teacher sees; filename keeps the extension if they renamed it.
    const name = isReadableFile(file.display_name) ? file.display_name : file.filename;
    if (file.size > MAX_UPLOAD_BYTES) throw new CanvasError("too-large");
    const bytes = await client.download(file.url, MAX_UPLOAD_BYTES);
    return { ok: true, input: { kind: "canvas-file", name, bytes } };
  } catch (e) {
    return refusal(e, "That file");
  }
}

function refusal(e: unknown, what: string): FetchedContent & { ok: false } {
  if (!(e instanceof CanvasError)) throw e;
  const say = (reason: string, reconnect = false) => ({ ok: false as const, reason, reconnect });
  switch (e.kind) {
    case "token-rejected":
      return say("Canvas didn't accept your connection. Reconnect Canvas and try again.", true);
    case "not-found":
      return say(`${what} isn't in Canvas anymore. Pick another.`);
    case "forbidden":
      return say(`Canvas won't let your account open ${what.toLowerCase()}.`);
    case "too-large":
      return say(`${what} is over 4 MB. Use a smaller file, or paste the part students need.`);
    default:
      return say("Canvas didn't answer. Try again in a minute.");
  }
}
