/**
 * Where adding a material goes afterwards. Normally the Materials tab; when
 * the form was opened from somewhere in the same course (an activity's setup,
 * say) with `?next=`, back there, told what was just added.
 */

/** `next` when it's a path inside this course, else null, so `?next=` can't send a teacher elsewhere. */
export function materialReturnPath(next: unknown, courseId: string): string | null {
  if (typeof next !== "string" || next.includes("\\")) return null;
  const prefix = `/courses/${courseId}/`;
  if (!next.startsWith(prefix)) return null;
  const url = new URL(next, "http://dalaa.local");
  // Dot segments or encoded tricks that leave the course don't count.
  return url.origin === "http://dalaa.local" && url.pathname.startsWith(prefix) ? `${url.pathname}${url.search}` : null;
}

/**
 * The page to land on after saving: `next` with `added=content:<id>` (a
 * reading) or `added=guide:<id>` (an AI-only note), or the Materials tab with
 * the new row marked.
 */
export function afterAddPath(next: unknown, courseId: string, saved: { id: string; aiOnly: boolean }): string {
  const back = materialReturnPath(next, courseId);
  if (!back) return `/courses/${courseId}/materials?added=${saved.id}`;
  const url = new URL(back, "http://dalaa.local");
  url.searchParams.set("added", `${saved.aiOnly ? "guide" : "content"}:${saved.id}`);
  return `${url.pathname}${url.search}`;
}
