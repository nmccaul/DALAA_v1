/**
 * The Results tab's switch (D-046): Gradebook · Insights. Grades and
 * Disputes became the Gradebook; their old links land there.
 */

export const RESULTS_VIEWS = ["gradebook", "insights"] as const;
export type ResultsView = (typeof RESULTS_VIEWS)[number];

export function resultsView(view: string | string[] | undefined): ResultsView {
  return view === "insights" ? "insights" : "gradebook";
}

/** The Gradebook, optionally narrowed to one assignment and/or with one student's grade open beside it. */
export function gradebookPath(courseId: string, opts: { assignment?: string; open?: string; from?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.assignment) q.set("assignment", opts.assignment);
  if (opts.open) q.set("open", opts.open);
  if (opts.from) q.set("from", opts.from);
  const query = q.toString();
  return `/courses/${courseId}/grading${query ? `?${query}` : ""}`;
}

/** One assignment's grades: the Gradebook with only its column (feedback 12f80baa). */
export const gradesPath = (courseId: string, activityId: string) => gradebookPath(courseId, { assignment: activityId });

/** One assignment's Insights page. */
export const insightsPath = (courseId: string, activityId: string) => `/courses/${courseId}/grading/insights/${activityId}`;
