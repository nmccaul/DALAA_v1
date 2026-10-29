import { describe, expect, it } from "vitest";
import { afterPick } from "@/app/(teacher)/courses/[courseId]/content/canvas/return-path";
import { afterPublishPath, deepLinkPath, keepPicker, PICKER_PARAM, pickerRequest } from "./picker";

const COURSE = "8d1f6a52-0c8e-4b7a-9d55-3f0c2b1e9a10";
const REQUEST = "2b7c9e41-5d3a-4f60-8a1b-6c2d0e9f7a35";

describe("the Add to Canvas picker through the create flow", () => {
  it("reads only a request id, never a path or junk", () => {
    expect(pickerRequest(REQUEST)).toBe(REQUEST);
    expect(pickerRequest(REQUEST.toUpperCase())).toBe(REQUEST);
    for (const bad of [undefined, null, "", ["a", "b"], [REQUEST], "//evil.example.com", `${REQUEST}/../x`, "not-a-uuid"]) {
      expect(pickerRequest(bad)).toBeNull();
    }
  });

  it("keeps the request on each step's path, alongside what's already there", () => {
    expect(keepPicker(`/courses/${COURSE}/activities/new`, null)).toBe(`/courses/${COURSE}/activities/new`);
    expect(keepPicker(`/courses/${COURSE}/activities/new`, REQUEST)).toBe(`/courses/${COURSE}/activities/new?${PICKER_PARAM}=${REQUEST}`);
    expect(keepPicker(`/courses/${COURSE}/activities/new/study-chat?content=c1`, REQUEST)).toBe(
      `/courses/${COURSE}/activities/new/study-chat?content=c1&${PICKER_PARAM}=${REQUEST}`,
    );
  });

  it("survives a detour to pick a Canvas page or file", () => {
    const step = keepPicker(`/courses/${COURSE}/activities/new/study-chat`, REQUEST);
    const back = new URL(afterPick(COURSE, step, "c9"), "http://dalaa.local");
    expect(back.pathname).toBe(`/courses/${COURSE}/activities/new/study-chat`);
    expect(pickerRequest(back.searchParams.get(PICKER_PARAM))).toBe(REQUEST);
    expect(back.searchParams.get("content")).toBe("c9");
  });

  it("Publish returns to the picker when it came from one, else to the course", () => {
    expect(afterPublishPath(COURSE, REQUEST)).toBe(deepLinkPath(COURSE, REQUEST));
    expect(afterPublishPath(COURSE, REQUEST)).toBe(`/courses/${COURSE}/add-to-canvas/${REQUEST}`);
    expect(afterPublishPath(COURSE, pickerRequest("junk"))).toBe(`/courses/${COURSE}`);
  });
});
