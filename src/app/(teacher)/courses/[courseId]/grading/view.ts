/** The Results tab's switch (D-035): Insights · Grades · Disputes. Insights is first and the default. */

export const RESULTS_VIEWS = ["insights", "grades", "disputes"] as const;
export type ResultsView = (typeof RESULTS_VIEWS)[number];

export function resultsView(view: string | string[] | undefined): ResultsView {
  return (RESULTS_VIEWS as readonly unknown[]).includes(view) ? (view as ResultsView) : "insights";
}
