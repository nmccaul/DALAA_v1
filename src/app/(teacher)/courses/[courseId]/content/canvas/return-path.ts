import { connectReturnPath } from "@/canvas/connection";

/** Where a pick returns to: the step that asked for it, with the saved content's id. */
export function afterPick(courseId: string, next: unknown, contentId: string): string {
  const back = typeof next === "string" && next ? connectReturnPath(next) : `/courses/${courseId}/content/canvas`;
  const url = new URL(back, "http://dalaa.local");
  url.searchParams.set("content", contentId);
  return `${url.pathname}${url.search}`;
}
