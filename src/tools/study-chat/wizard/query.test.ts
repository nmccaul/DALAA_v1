import { describe, expect, it } from "vitest";
import { afterAddPath } from "@/content/return-path";
import { addMaterialPath, goalFromQuery, goalStepPath, materialsFromQuery, materialsStepPath, savedIds } from "./query";

const C = "33333333-3333-4333-8333-333333333333";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const N = "44444444-4444-4444-8444-444444444444";
const PICKER = "55555555-5555-4555-8555-555555555555";

const query = (path: string) => Object.fromEntries(new URL(path, "http://x").searchParams);

describe("step 1's add-a-material links", () => {
  it("keeps only saved ticks from the boxes", () => {
    expect(savedIds([`content:${A}`, "page:case", `guide:${B}`, `content:${A}`, "content:nope"])).toEqual({ contentIds: [A], guideIds: [B] });
  });

  it("comes back to step 1 with what was ticked plus the new material", () => {
    const link = addMaterialPath(C, "upload", { contentIds: [A], guideIds: [B] }, PICKER);
    const { next, kind } = query(link);
    expect(link.startsWith(`/courses/${C}/materials/new?`)).toBe(true);
    expect(kind).toBe("upload");

    // The add-material form saves a reading and follows next.
    const back = afterAddPath(next, C, { id: N, aiOnly: false });
    expect(back.startsWith(`/courses/${C}/activities/new/study-chat?`)).toBe(true);
    const params = query(back);
    expect(params.step).toBe("materials");
    expect(params.addToCanvas).toBe(PICKER);
    expect(materialsFromQuery(params)).toEqual({ contentIds: [A, N], guideIds: [B] });
  });

  it("an AI-only note added from step 1 comes back ticked as one", () => {
    const { next } = query(addMaterialPath(C, "paste", { contentIds: [], guideIds: [] }, null));
    expect(next).toBe(`/courses/${C}/activities/new/study-chat?step=materials`);
    expect(materialsFromQuery(query(afterAddPath(next, C, { id: N, aiOnly: true })))).toEqual({ contentIds: [], guideIds: [N] });
  });

  it("doesn't tick an added id twice or a malformed one at all", () => {
    expect(materialsFromQuery({ content: A, added: `content:${A}` })).toEqual({ contentIds: [A], guideIds: [] });
    expect(materialsFromQuery({ added: "content:x" })).toEqual({ contentIds: [], guideIds: [] });
    expect(materialsStepPath(C, { contentIds: [], guideIds: [] }, null)).toBe(`/courses/${C}/activities/new/study-chat?step=materials`);
  });
});

describe("step 2's answers in the URL", () => {
  it("keeps the teacher's goal and a known length, and drops anything else", () => {
    expect(goalFromQuery({ goal: "  Defend a recommendation.  ", minutes: "45+" })).toEqual({ goal: "Defend a recommendation.", minutes: "45+" });
    expect(goalFromQuery({ goal: "   ", minutes: "90" })).toEqual({ goal: null, minutes: null });
    expect(goalFromQuery({ goal: "Name the stripes.", minutes: "2-5" })).toEqual({ goal: "Name the stripes.", minutes: "2-5" });
    expect(goalFromQuery({ goal: "Name the stripes.", minutes: "5-10" }).minutes).toBe("5-10");
    expect(goalFromQuery({ goal: ["a", "b"] })).toEqual({ goal: null, minutes: null });
    expect(goalFromQuery({ goal: "x".repeat(5000) }).goal).toHaveLength(1000);
  });

  it("goes back to step 2 with the materials, goal and length kept", () => {
    const path = goalStepPath(C, { contentIds: [A], guideIds: [N] }, { goal: "Weigh the options & pick one.", minutes: "10-15" }, PICKER);
    expect(path.startsWith(`/courses/${C}/activities/new/study-chat?`)).toBe(true);
    const back = query(path);
    expect(back).toMatchObject({ step: "goal", content: A, guide: N, minutes: "10-15" });
    expect(goalFromQuery(back)).toEqual({ goal: "Weigh the options & pick one.", minutes: "10-15" });
    expect(materialsFromQuery(back)).toEqual({ contentIds: [A], guideIds: [N] });
    expect(back.addToCanvas).toBe(PICKER);
  });
});

