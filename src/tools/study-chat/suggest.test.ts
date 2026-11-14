import { MockLanguageModelV4 } from "ai/test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { goalPrompt, suggestGoalFor, suggestPrompt, suggestTypes } from "./suggest";
import { answering } from "./test-fixtures";

const sent = (model: MockLanguageModelV4) => JSON.stringify(model.doGenerateCalls[0].prompt);

const harbor = {
  readings: [{ name: "Case: Harbor Bikes", body: "Harbor Bikes sells 1,200 bikes a year. Maya must decide on a second store." }],
  guides: [],
};

const explainOnly = [{ mode: "explain", reason: null, goal: null }];

const failing = () =>
  new MockLanguageModelV4({
    modelId: "test/grader",
    doGenerate: async () => {
      throw new Error("gateway down");
    },
  });

describe("step 2 suggestions", () => {
  let db: Db;
  const ledger = () => db.query<{ purpose: string; ok: boolean }>("select purpose, ok from ai_calls order by created_at");

  beforeAll(async () => {
    db = await testDb();
  });
  beforeEach(async () => {
    await db.query("delete from ai_calls");
  });

  it("suggests the two best kinds, each with a goal written for it, in one call recorded as suggest.goal", async () => {
    const model = answering({
      types: [
        { mode: "Case-Chat", reason: " The case has a decision  to make. ", goal: " Recommend whether Maya should open\n a second store. " },
        { mode: "debate", reason: "There are two sides.", goal: "Defend opening or waiting." },
        { mode: "socratic", reason: "A third is dropped.", goal: "x" },
      ],
    });
    expect(await suggestTypes(db, model, {}, harbor)).toEqual([
      { mode: "case-chat", reason: "The case has a decision to make.", goal: "Recommend whether Maya should open a second store." },
      { mode: "debate", reason: "There are two sides.", goal: "Defend opening or waiting." },
    ]);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(sent(model)).toContain("Harbor Bikes sells 1,200 bikes a year.");
    expect(await ledger()).toEqual([{ purpose: "suggest.goal", ok: true }]);
  });

  it("drops kinds that don't exist and repeats, and keeps a kind whose reason or goal is unusable without it", async () => {
    const model = answering({
      types: [
        { mode: "lecture", reason: "Not a mode.", goal: "Lecture." },
        { mode: "apply", reason: "x".repeat(301), goal: "   " },
        { mode: "apply", reason: "Again.", goal: "Again." },
      ],
    });
    expect(await suggestTypes(db, model, {}, harbor)).toEqual([{ mode: "apply", reason: null, goal: null }]);
  });

  it("falls back to Explain with no goal when the model fails or answers off-schema, and asks nothing with no reading text", async () => {
    expect(await suggestTypes(db, failing(), {}, harbor)).toEqual(explainOnly);
    expect(await suggestTypes(db, answering({ nope: 1 }), {}, harbor)).toEqual(explainOnly);
    expect(await suggestTypes(db, answering({ types: [] }), {}, harbor)).toEqual(explainOnly);
    const unused = answering({ types: [] });
    expect(await suggestTypes(db, unused, {}, { readings: [{ name: "Empty", body: "  " }], guides: [] })).toEqual(explainOnly);
    expect(unused.doGenerateCalls).toHaveLength(0);
  });

  it("writes a goal for the kind the teacher picked, or none when the model fails or answers blank", async () => {
    const model = answering({ goal: "  Defend opening the store\n or waiting. " });
    expect(await suggestGoalFor(db, model, {}, harbor, "debate")).toBe("Defend opening the store or waiting.");
    expect(sent(model)).toContain("The kind of chat: Debate.");
    expect(await suggestGoalFor(db, failing(), {}, harbor, "debate")).toBeNull();
    expect(await suggestGoalFor(db, answering({ goal: "x".repeat(601) }), {}, harbor, "debate")).toBeNull();
    expect((await ledger()).map((r) => r.purpose)).toEqual(Array(3).fill("suggest.goal"));
  });
});

describe("prompts", () => {
  it("list every kind and fence every reading and AI-only note under its own name", () => {
    const materials = {
      readings: [...harbor.readings, { name: "Lease terms", body: "The lease runs five years." }],
      guides: [{ name: "Answer key", body: "Waiting is better: cash is short in winter." }],
    };
    const { prompt } = suggestPrompt(materials);
    expect(prompt).toContain("- case-chat: Case Chat.");
    expect(prompt).toContain("- defend: Defend.");
    expect(prompt).toContain('Material title: Lease terms\n<material role="student-reading">\nThe lease runs five years.');
    expect(prompt).toContain('<material role="ai-only-guide">\nWaiting is better');
    expect(goalPrompt(materials, "pitch").prompt).toContain("The kind of chat: Pitch.");
  });
});
