import { describe, expect, it } from "vitest";
import { MAX_REASON_CHARS } from "../suggest";
import { reasonField, typeRequestFrom } from "./type-request";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const G = "44444444-4444-4444-8444-444444444444";
const KEY = "55555555-5555-4555-8555-555555555555";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const base = { content: `${A},${B}`, guide: G, goal: "  Explain why prices rise.  ", minutes: "45+", mode: "apply", creationKey: KEY };

describe("step 3's form", () => {
  it("carries the picks, goal and length, and the chosen type", () => {
    expect(typeRequestFrom(form(base))).toEqual({
      ok: true,
      ids: { contentIds: [A, B], guideIds: [G] },
      goal: "Explain why prices rise.",
      minutes: "45+",
      mode: "apply",
      typeReason: null,
      studentWork: false,
      creationKey: KEY,
    });
  });

  it("keeps the reason only for the card picked", () => {
    const fields = { ...base, [reasonField("apply")]: " Your goal  asks them to use it. ", [reasonField("explain")]: "Not this one." };
    const picked = typeRequestFrom(form(fields));
    expect(picked.ok && picked.typeReason).toBe("Your goal asks them to use it.");

    // A type from "More types" has no reason, even if suggested cards had some.
    const other = typeRequestFrom(form({ ...fields, mode: "debate" }));
    expect(other.ok && other.typeReason).toBeNull();
  });

  it("caps a reason at the stored length", () => {
    const long = typeRequestFrom(form({ ...base, [reasonField("apply")]: "x".repeat(MAX_REASON_CHARS + 50) }));
    expect(long.ok && long.typeReason?.length).toBe(MAX_REASON_CHARS);
  });

  it("turns students-bring-work on for a type about their own work", () => {
    const defend = typeRequestFrom(form({ ...base, mode: "defend" }));
    expect(defend.ok && defend.studentWork).toBe(true);
  });

  it("drops a bad length and needs no AI-only notes", () => {
    const parsed = typeRequestFrom(form({ ...base, guide: "", minutes: "3 hours" }));
    expect(parsed.ok && parsed.ids).toEqual({ contentIds: [A, B], guideIds: [] });
    expect(parsed.ok && parsed.minutes).toBeNull();
  });

  it("refuses in a plain sentence when something is missing", () => {
    expect(typeRequestFrom(form({ ...base, content: "nope" }))).toEqual({ ok: false, reason: expect.stringMatching(/step 1/) });
    expect(typeRequestFrom(form({ ...base, goal: "   " }))).toEqual({ ok: false, reason: expect.stringMatching(/step 2/) });
    expect(typeRequestFrom(form({ ...base, mode: "suggest" }))).toEqual({ ok: false, reason: "Pick a type of activity." });
    expect(typeRequestFrom(form({ ...base, creationKey: "" })).ok).toBe(false);
  });
});
