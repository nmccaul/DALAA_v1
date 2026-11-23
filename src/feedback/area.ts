/**
 * Where in DALAA a feedback report is about, from the page it was sent on, so
 * the Help tab's feedback list filters by the course's own tabs, then by a
 * section within the tab (Nathan, 2026-11-22). Pure: tested in area.test.ts.
 */

/** The course tabs, in their own order, and Other; each with its sections. */
export const TABS = [
  {
    key: "activities",
    label: "Activities",
    sections: [
      { key: "list", label: "Activities list" },
      { key: "create", label: "Creating an activity" },
      { key: "student", label: "Student view" },
    ],
  },
  {
    key: "materials",
    label: "Materials",
    sections: [
      { key: "list", label: "Materials list" },
      { key: "add", label: "Adding a material" },
    ],
  },
  {
    key: "results",
    label: "Results",
    sections: [
      { key: "grades", label: "Grades" },
      { key: "chat", label: "A student's chat" },
      { key: "insights", label: "Insights" },
    ],
  },
  {
    key: "setup",
    label: "Setup",
    sections: [
      { key: "setup", label: "Setup" },
      { key: "students", label: "Students" },
      { key: "canvas", label: "Canvas" },
    ],
  },
  { key: "help", label: "Help", sections: [{ key: "help", label: "Help" }] },
  {
    key: "other",
    label: "Other",
    sections: [
      { key: "courses", label: "Courses list" },
      { key: "settings", label: "Settings" },
      { key: "other", label: "Anything else" },
    ],
  },
] as const;

export type Tab = (typeof TABS)[number]["key"];
export type Place = { tab: Tab; section: string };

export const isTab = (value: unknown): value is Tab => TABS.some((t) => t.key === value);

/** The sections of a tab, for its dropdown. */
export const sectionsOf = (tab: Tab) => TABS.find((t) => t.key === tab)!.sections;

const place = (tab: Tab, section: string): Place => ({ tab, section });

/** The tab and section of the page at `url` (a full address, as reports store it). */
export function feedbackArea(url: string): Place {
  let path: string;
  let view: string | null;
  try {
    const u = new URL(url);
    path = u.pathname.replace(/\/+$/, "");
    view = u.searchParams.get("view");
  } catch {
    return place("other", "other");
  }
  const course = path.match(/^\/courses\/[^/]+(\/.*)?$/);
  if (course) {
    const rest = course[1] ?? "";
    if (rest === "") return place("activities", "list");
    if (/^\/activities\/new(\/|$)/.test(rest) || /^\/activities\/[^/]+\/setup(\/|$)/.test(rest)) return place("activities", "create");
    if (rest.startsWith("/activities")) return place("activities", "list");
    if (/^\/materials\/(new|case-writer)(\/|$)/.test(rest)) return place("materials", "add");
    if (rest.startsWith("/materials")) return place("materials", "list");
    if (rest.startsWith("/grading/insights") || (rest === "/grading" && view === "insights")) return place("results", "insights");
    if (rest.startsWith("/grading/attempts")) return place("results", "chat");
    if (rest.startsWith("/grading")) return place("results", "grades");
    if (rest.startsWith("/dalaa")) return place("setup", "setup");
    if (rest.startsWith("/students")) return place("setup", "students");
    if (rest.startsWith("/canvas") || rest.startsWith("/add-to-canvas")) return place("setup", "canvas");
    if (rest.startsWith("/help")) return place("help", "help");
    return place("other", "other");
  }
  if (path === "/courses") return place("other", "courses");
  if (path.startsWith("/settings")) return place("other", "settings");
  if (path === "" || path.startsWith("/activities")) return place("activities", "student");
  return place("other", "other");
}
