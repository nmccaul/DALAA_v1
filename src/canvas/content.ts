/**
 * Course content from Canvas: the pages and files a teacher can pick, and the
 * picked one fetched as a `ContentInput` for `saveContent` (src/content/).
 * Reads from Canvas only. Every refusal is a sentence the teacher can act on.
 */

import { isReadableFile, MAX_UPLOAD_BYTES, type ContentInput } from "@/content/read";
import { saveContent, type SavedContent } from "@/content/store";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { CanvasError, type CanvasClient, type CanvasFile, type CanvasPage } from "./client";
import type { TeacherCanvas } from "./connection";
import { canvasIdOf, taughtCourse } from "./sync";

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

/** Why a course's Canvas content can't be listed. */
export type CourseContentProblem = "not-yours" | "not-linked" | "wrong-canvas" | "reconnect" | "unavailable";

/** The Canvas course behind a DALAA course, if this teacher's connection can reach it. */
async function linkedCanvasCourse(
  db: Db,
  actor: Actor,
  canvas: TeacherCanvas,
  courseId: string,
): Promise<{ ok: true; canvasCourseId: number } | { ok: false; reason: CourseContentProblem }> {
  const course = await taughtCourse(db, actor, courseId);
  if (!course) return { ok: false, reason: "not-yours" };
  if (!course.canvas_course_id) return { ok: false, reason: "not-linked" };
  // A practice course's pages live in practice Canvas, a real course's in real Canvas.
  if (course.is_practice !== (canvas.mode === "practice")) return { ok: false, reason: "wrong-canvas" };
  return { ok: true, canvasCourseId: canvasIdOf(course.canvas_course_id) };
}

/** The pages and readable files of the Canvas course this DALAA course is linked to. */
export async function listCourseCanvasContent(
  db: Db,
  actor: Actor,
  canvas: TeacherCanvas,
  courseId: string,
): Promise<{ ok: true; list: CanvasContentList } | { ok: false; reason: CourseContentProblem }> {
  const linked = await linkedCanvasCourse(db, actor, canvas, courseId);
  if (!linked.ok) return linked;
  try {
    return { ok: true, list: await listCanvasContent(canvas.client, linked.canvasCourseId) };
  } catch (e) {
    if (!(e instanceof CanvasError)) throw e;
    if (e.kind === "token-rejected") return { ok: false, reason: "reconnect" };
    if (e.kind === "not-found" || e.kind === "forbidden") return { ok: false, reason: "not-yours" };
    return { ok: false, reason: "unavailable" };
  }
}

export type CanvasPick = { kind: "page"; url: string } | { kind: "file"; id: number };

export type SaveFromCanvasResult =
  | { ok: true; content: SavedContent }
  | { ok: false; reason: string; reconnect: boolean };

/**
 * Saves the picked Canvas page or file as course content. `creationKey` is
 * client-generated, so a double click saves one copy.
 */
export async function saveFromCanvas(
  db: Db,
  actor: Actor,
  canvas: TeacherCanvas,
  courseId: string,
  creationKey: string,
  pick: CanvasPick,
): Promise<SaveFromCanvasResult> {
  const linked = await linkedCanvasCourse(db, actor, canvas, courseId);
  if (!linked.ok) return { ok: false, reason: "This course can't use that Canvas course's pages.", reconnect: false };
  const fetched =
    pick.kind === "page"
      ? await fetchCanvasPage(canvas.client, linked.canvasCourseId, pick.url)
      : await fetchCanvasFile(canvas.client, linked.canvasCourseId, pick.id);
  if (!fetched.ok) return fetched;
  const saved = await saveContent(db, actor, courseId, creationKey, fetched.input);
  return saved.ok ? saved : { ...saved, reconnect: false };
}
