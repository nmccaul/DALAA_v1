import { describe, expect, it } from "vitest";
import { feedbackArea, isTab, sectionsOf, TABS } from "./area";

const site = "https://dalaa-v1.vercel.app";
const course = `${site}/courses/0e0735e5-ad33-470d-8713-bb0464c9ed00`;
const activity = "dfd635b1-fa80-4cd3-bf3d-d29a6ffd0c75";
const at = (url: string) => {
  const p = feedbackArea(url);
  return `${p.tab}/${p.section}`;
};

describe("feedbackArea", () => {
  it("files Activities pages, the new-activity steps and the student page under Activities", () => {
    expect(at(course)).toBe("activities/list");
    expect(at(`${course}/`)).toBe("activities/list");
    expect(at(`${course}/activities/${activity}`)).toBe("activities/list");
    expect(at(`${course}/activities/${activity}/assign`)).toBe("activities/list");
    expect(at(`${course}/activities/new/study-chat?step=goal`)).toBe("activities/create");
    expect(at(`${course}/activities/${activity}/setup/grading`)).toBe("activities/create");
    expect(at(`${site}/activities/${activity}`)).toBe("activities/student");
    expect(at(`${site}/`)).toBe("activities/student");
  });

  it("files Materials, Results, Setup and Help pages under their tab", () => {
    expect(at(`${course}/materials?source=paste`)).toBe("materials/list");
    expect(at(`${course}/materials/new?kind=web`)).toBe("materials/add");
    expect(at(`${course}/materials/case-writer`)).toBe("materials/add");
    expect(at(`${course}/grading?view=grades`)).toBe("results/grades");
    expect(at(`${course}/grading/attempts/250f3a2e-2a5a-4015-aa81-86658b5c70d3`)).toBe("results/chat");
    expect(at(`${course}/grading?view=insights`)).toBe("results/insights");
    expect(at(`${course}/grading/insights/928ed615-4e6a-48a0-99dd-913076e0789b`)).toBe("results/insights");
    expect(at(`${course}/dalaa`)).toBe("setup/setup");
    expect(at(`${course}/students`)).toBe("setup/students");
    expect(at(`${course}/add-to-canvas`)).toBe("setup/canvas");
    expect(at(`${course}/help`)).toBe("help/help");
  });

  it("puts everything else under Other", () => {
    expect(at(`${site}/courses`)).toBe("other/courses");
    expect(at(`${site}/settings/feedback`)).toBe("other/settings");
    expect(at(`${site}/sign-in`)).toBe("other/other");
    expect(at("not a url")).toBe("other/other");
  });

  it("only ever names a section its tab lists", () => {
    const urls = [course, `${course}/materials/new`, `${course}/grading/attempts/x`, `${course}/students`, `${site}/settings`, `${site}/x`];
    for (const url of urls) {
      const p = feedbackArea(url);
      expect(sectionsOf(p.tab).map((s) => s.key)).toContain(p.section);
    }
  });

  it("checks a tab from the address bar", () => {
    expect(TABS.map((t) => t.label)).toEqual(["Activities", "Materials", "Results", "Setup", "Help", "Other"]);
    expect(isTab("results")).toBe(true);
    expect(isTab("insights")).toBe(false);
  });
});
