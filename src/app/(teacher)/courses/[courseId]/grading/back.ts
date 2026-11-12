/**
 * Where a Results form returns to: the page it was sent from (a view of the
 * Results tab or a student's transcript), with what happened in the query.
 * Anything that isn't a page of this course's Results tab goes to the tab
 * itself, so a forged `from` can't send the teacher elsewhere.
 */
export function backTo(courseId: string, from: unknown, outcome: Record<string, string>, hash: string): string {
  const results = `/courses/${courseId}/grading`;
  const url = new URL(typeof from === "string" ? from : results, "http://dalaa.invalid");
  const same = url.origin === "http://dalaa.invalid" && (url.pathname === results || url.pathname.startsWith(`${results}/`));
  const path = same ? url.pathname : results;
  const q = new URLSearchParams(same && url.searchParams.has("view") ? { view: url.searchParams.get("view")! } : {});
  for (const [k, v] of Object.entries(outcome)) q.set(k, v);
  return `${path}?${q}#${hash}`;
}
