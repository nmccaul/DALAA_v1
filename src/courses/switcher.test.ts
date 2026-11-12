import { describe, expect, it } from "vitest";
import type { Tab } from "@/components/tab-match";
import type { CourseCard } from "./queries";
import { switchableCourses, switchHref } from "./switcher";

const card = (id: string, code: string, extra: Partial<CourseCard> = {}): CourseCard => ({
  id,
  code,
  title: "Intro",
  term: "Winter 2027",
  students: 0,
  isPractice: false,
  canvasLinked: false,
  canvasSyncedAt: null,
  ...extra,
});

describe("switchableCourses", () => {
  it("lists every other course in the order given, practice ones included", () => {
    const courses = [card("a", "ACC 200"), card("b", "MBA 501", { isPractice: true }), card("c", "ACC 310")];
    expect(switchableCourses(courses, "b")).toEqual([
      { id: "a", name: "ACC 200", term: "Winter 2027", isPractice: false },
      { id: "c", name: "ACC 310", term: "Winter 2027", isPractice: false },
    ]);
    expect(switchableCourses(courses, "a")).toEqual([
      { id: "b", name: "MBA 501", term: "Winter 2027", isPractice: true },
      { id: "c", name: "ACC 310", term: "Winter 2027", isPractice: false },
    ]);
  });

  it("is empty for a teacher with one course, so there's no menu", () => {
    expect(switchableCourses([card("a", "ACC 200")], "a")).toEqual([]);
  });

  it("names a course without a code by its title", () => {
    expect(switchableCourses([card("a", "ACC 200"), card("b", "")], "a")[0].name).toBe("Intro");
  });
});

describe("switchHref", () => {
  const from = "/courses/one";
  // The same shape as the course layout's tabs.
  const tabs: Tab[] = [
    { href: from, label: "Activities", exact: true, also: [`${from}/activities`, `${from}/add-to-canvas`] },
    { href: `${from}/materials`, label: "Materials", also: [`${from}/content`] },
    { href: `${from}/grading`, label: "Results" },
    { href: `${from}/dalaa`, label: "Setup", also: [`${from}/students`, `${from}/canvas`] },
  ];
  const to = (path: string) => switchHref(tabs, path, from, "two");

  it("keeps the tab, opening it at the top", () => {
    expect(to(from)).toBe("/courses/two");
    expect(to(`${from}/materials`)).toBe("/courses/two/materials");
    expect(to(`${from}/materials/m1/edit`)).toBe("/courses/two/materials");
    expect(to(`${from}/grading`)).toBe("/courses/two/grading");
    expect(to(`${from}/grading/act1`)).toBe("/courses/two/grading");
    expect(to(`${from}/dalaa`)).toBe("/courses/two/dalaa");
  });

  it("maps a page that belongs to a tab to that tab", () => {
    expect(to(`${from}/activities/act1`)).toBe("/courses/two");
    expect(to(`${from}/add-to-canvas`)).toBe("/courses/two");
    expect(to(`${from}/content/c1`)).toBe("/courses/two/materials");
    expect(to(`${from}/students`)).toBe("/courses/two/dalaa");
    expect(to(`${from}/canvas`)).toBe("/courses/two/dalaa");
  });

  it("opens Activities from a page on no tab", () => {
    expect(to(`${from}/somewhere-else`)).toBe("/courses/two");
    expect(to("/courses/one-more/materials")).toBe("/courses/two");
  });
});
