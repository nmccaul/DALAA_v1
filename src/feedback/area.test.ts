import { describe, expect, it } from "vitest";
import { feedbackArea, isArea } from "./area";

const site = "https://dalaa-v1.vercel.app";
const course = `${site}/courses/0e0735e5-ad33-470d-8713-bb0464c9ed00`;
const activity = "dfd635b1-fa80-4cd3-bf3d-d29a6ffd0c75";

describe("feedbackArea", () => {
  it("files course pages under their tab", () => {
    expect(feedbackArea(course)).toBe("activities");
    expect(feedbackArea(`${course}/`)).toBe("activities");
    expect(feedbackArea(`${course}/activities/${activity}`)).toBe("activities");
    expect(feedbackArea(`${course}/activities/${activity}/assign`)).toBe("activities");
    expect(feedbackArea(`${course}/materials?source=paste`)).toBe("materials");
    expect(feedbackArea(`${course}/materials/new?kind=web`)).toBe("materials");
    expect(feedbackArea(`${course}/grading?view=grades`)).toBe("results");
    expect(feedbackArea(`${course}/grading/attempts/250f3a2e-2a5a-4015-aa81-86658b5c70d3`)).toBe("results");
    expect(feedbackArea(`${course}/dalaa`)).toBe("setup");
    expect(feedbackArea(`${course}/students`)).toBe("setup");
    expect(feedbackArea(`${course}/help`)).toBe("help");
  });

  it("puts the new-activity steps and editing an activity's setup together", () => {
    expect(feedbackArea(`${course}/activities/new/study-chat?step=goal`)).toBe("create");
    expect(feedbackArea(`${course}/activities/${activity}/setup/grading`)).toBe("create");
  });

  it("splits Insights from the rest of Results", () => {
    expect(feedbackArea(`${course}/grading?view=insights`)).toBe("insights");
    expect(feedbackArea(`${course}/grading/insights/928ed615-4e6a-48a0-99dd-913076e0789b`)).toBe("insights");
  });

  it("knows the pages outside a course", () => {
    expect(feedbackArea(`${site}/courses`)).toBe("courses");
    expect(feedbackArea(`${site}/settings/feedback`)).toBe("settings");
    expect(feedbackArea(`${site}/activities/${activity}`)).toBe("student");
    expect(feedbackArea(`${site}/`)).toBe("student");
    expect(feedbackArea(`${site}/sign-in`)).toBe("other");
    expect(feedbackArea("not a url")).toBe("other");
  });

  it("checks a filter value from the address bar", () => {
    expect(isArea("materials")).toBe(true);
    expect(isArea("nope")).toBe(false);
    expect(isArea(undefined)).toBe(false);
  });
});
