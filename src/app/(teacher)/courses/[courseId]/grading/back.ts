/**
 * Where a Results form returns to: the page it was sent from (the Gradebook,
 * with the grade it had open), with what happened in the query.
 * Anything that isn't a page of this course's Results tab goes to the tab
 * itself, so a forged `from` can't send the teacher elsewhere.
 */
export function backTo(courseId: string, from: unknown, outcome: Record<string, string>, hash: string): string {
  const results = `/courses/${courseId}/grading`;
  const url = new URL(typeof from === "string" ? from : results, "http://dalaa.invalid");
  const same = url.origin === "http://dalaa.invalid" && (url.pathname === results || url.pathname.startsWith(`${results}/`));
  const path = same ? url.pathname : results;
  // Only what places the page (the view, an assignment, the open grade, where it was opened from); never old outcomes.
  const q = new URLSearchParams();
  if (same) for (const key of ["view", "assignment", "open", "from"]) if (url.searchParams.has(key)) q.set(key, url.searchParams.get(key)!);
  for (const [k, v] of Object.entries(outcome)) q.set(k, v);
  return `${path}?${q}#${hash}`;
}
