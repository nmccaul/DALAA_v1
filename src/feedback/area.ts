/**
 * Which part of DALAA a feedback report is about, from the page it was sent
 * on, so the Help tab's feedback list can be filtered by tab or feature
 * (Nathan, 2026-11-22). Pure: tested in area.test.ts.
 */

export const AREAS = [
  { key: "activities", label: "Activities" },
  { key: "create", label: "Creating an activity" },
  { key: "materials", label: "Materials" },
  { key: "results", label: "Results" },
  { key: "insights", label: "Insights" },
  { key: "setup", label: "Setup" },
  { key: "help", label: "Help" },
  { key: "student", label: "Student view" },
  { key: "courses", label: "Courses" },
  { key: "settings", label: "Settings" },
  { key: "other", label: "Other" },
] as const;

export type Area = (typeof AREAS)[number]["key"];

export const isArea = (value: unknown): value is Area => AREAS.some((a) => a.key === value);

/** The area of the page at `url` (a full address, as reports store it). */
export function feedbackArea(url: string): Area {
  let path: string;
  let view: string | null;
  try {
    const u = new URL(url);
    path = u.pathname.replace(/\/+$/, "");
    view = u.searchParams.get("view");
  } catch {
    return "other";
  }
  const course = path.match(/^\/courses\/[^/]+(\/.*)?$/);
  if (course) {
    const rest = course[1] ?? "";
    if (rest === "") return "activities";
    if (/^\/activities\/new(\/|$)/.test(rest) || /^\/activities\/[^/]+\/setup(\/|$)/.test(rest)) return "create";
    if (rest.startsWith("/activities")) return "activities";
    if (rest.startsWith("/materials")) return "materials";
    if (rest.startsWith("/grading/insights") || (rest === "/grading" && view === "insights")) return "insights";
    if (rest.startsWith("/grading")) return "results";
    if (rest.startsWith("/dalaa") || rest.startsWith("/students") || rest.startsWith("/canvas") || rest.startsWith("/add-to-canvas")) return "setup";
    if (rest.startsWith("/help")) return "help";
    return "other";
  }
  if (path === "/courses") return "courses";
  if (path.startsWith("/settings")) return "settings";
  if (path === "" || path.startsWith("/activities")) return "student";
  return "other";
}
