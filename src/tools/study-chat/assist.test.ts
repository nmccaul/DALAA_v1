import { MockLanguageModelV4 } from "ai/test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { assistParts, assistPrompt } from "./assist";
import { blankSettings } from "./create";
import { applyParts, isEmpty, isListPart, PARTS, STEP_PARTS, type PartKey } from "./parts";
import { answering, draft } from "./test-fixtures";

const readings = [{ name: "Case: Harbor Bikes", body: "Harbor Bikes sells 1,200 bikes a year." }];
const guides = [{ name: "Answer key", body: "Waiting is better." }];
const blank = blankSettings({ mode: "debate", goal: "Defend opening or waiting.", studentWork: false, typeReason: null });

describe("parts DALAA can write", () => {
  it("reads, sets and says when each is empty", () => {
    for (const key of Object.keys(PARTS) as PartKey[]) {
      expect(isEmpty(blank, key)).toBe(key !== "goal");
      expect(isEmpty(draft(), key)).toBe(key === "question");
    }
    expect(isListPart("criteria")).toBe(true);
    expect(isListPart("opening")).toBe(false);
  });

  it("applies only answers that fit the setting, and an empty question is none", () => {
    const s = structuredClone(blank);
    applyParts(s, { opening: "Which side are you on?", touchpoints: [{ label: "Cash", description: "Seasonal cash." }], criteria: "nope", sneaky: 1 });
    expect(s.scenarios[0].opening).toBe("Which side are you on?");
    expect(s.touchpoints).toEqual([{ label: "Cash", description: "Seasonal cash." }]);
    expect(s.rubric.criteria).toEqual([]);
    applyParts(s, { question: "  " });
    expect(s.completion.question).toBeNull();
  });

  it("drafts the scenario and grading steps, and each part of them once", () => {
    expect(STEP_PARTS.scenario).toContain("opening");
    expect(STEP_PARTS.grading).toEqual(["touchpoints", "positions", "criteria"]);
    expect(STEP_PARTS.options).toBeUndefined();
  });
});

describe("assistParts", () => {
  let db: Db;
  beforeAll(async () => {
    db = await testDb();
  });
  beforeEach(async () => {
    await db.query("delete from ai_calls");
  });

  it("asks for just the parts named, with the materials, what's written and the teacher's direction, in one call recorded as assist", async () => {
    const model = answering({ situation: "Maya must pick a side.", opening: "Open or wait?" });
    const settings = { ...blank, persona: { ...blank.persona, name: "Maya Ortiz" } };
    const result = await assistParts(db, model, {}, { readings, guides, settings, parts: ["situation", "opening"], instruction: " use alien jargon " });
    expect(result).toEqual({ ok: true, values: { situation: "Maya must pick a side.", opening: "Open or wait?" } });

    const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(sent).toContain("Harbor Bikes sells 1,200 bikes a year.");
    expect(sent).toContain("Waiting is better.");
    expect(sent).toContain("Maya Ortiz");
    expect(sent).toContain('Write: \\"situation\\" (Situation), \\"opening\\" (Opening message).');
    expect(sent).toContain("The teacher's direction for this: use alien jargon");
    expect(await db.query("select purpose, ok from ai_calls")).toEqual([{ purpose: "assist", ok: true }]);
  });

  it("says so plainly when the model fails, and asks nothing without parts or reading text", async () => {
    const failing = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("gateway down");
      },
    });
    const ask = { readings, guides: [], settings: blank, parts: ["opening"] as PartKey[], instruction: "" };
    expect(await assistParts(db, failing, {}, ask)).toEqual({ ok: false, reason: expect.stringMatching(/couldn't write that/) });
    const unused = answering({});
    expect((await assistParts(db, unused, {}, { ...ask, parts: [] })).ok).toBe(false);
    expect((await assistParts(db, unused, {}, { ...ask, readings: [{ name: "Empty", body: " " }] })).ok).toBe(false);
    expect(unused.doGenerateCalls).toHaveLength(0);
  });

  it("leaves the direction out when there is none, and never sends the type's reason", () => {
    const { prompt } = assistPrompt({ readings, guides: [], settings: { ...blank, typeReason: "Secret why." }, parts: ["goal"], instruction: "  " });
    expect(prompt).not.toContain("direction");
    expect(prompt).not.toContain("Secret why.");
  });
});
