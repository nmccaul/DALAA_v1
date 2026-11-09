import { MockLanguageModelV4 } from "ai/test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { goalPrompt, suggestGoal, suggestTypes, typePrompt } from "./suggest";
import { answering } from "./test-fixtures";

const sent = (model: MockLanguageModelV4) => JSON.stringify(model.doGenerateCalls[0].prompt);

const harbor = {
  readings: [{ name: "Case: Harbor Bikes", body: "Harbor Bikes sells 1,200 bikes a year. Maya must decide on a second store." }],
  guides: [],
};

describe("suggestGoal", () => {
  let db: Db;
  const ledger = () => db.query<{ purpose: string; ok: boolean }>("select purpose, ok from ai_calls order by created_at");

  beforeAll(async () => {
    db = await testDb();
  });
  beforeEach(async () => {
    await db.query("delete from ai_calls");
  });

  it("suggests the goal from the material in one call, recorded as suggest.goal", async () => {
    const model = answering({ goal: "  Recommend whether Harbor Bikes should open a second store,\n using the case's numbers. " });
    const result = await suggestGoal(db, model, {}, harbor);
    expect(result).toEqual({ ok: true, goal: "Recommend whether Harbor Bikes should open a second store, using the case's numbers." });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(sent(model)).toContain("Harbor Bikes sells 1,200 bikes a year.");
    expect(await ledger()).toEqual([{ purpose: "suggest.goal", ok: true }]);
  });

  it("fences every reading and every AI-only note under its own name", () => {
    const { prompt } = goalPrompt({
      readings: [...harbor.readings, { name: "Lease terms", body: "The lease runs five years." }],
      guides: [{ name: "Answer key", body: "Waiting is better: cash is short in winter." }],
    });
    expect(prompt).toContain('Material title: Case: Harbor Bikes\n<material role="student-reading">');
    expect(prompt).toContain('Material title: Lease terms\n<material role="student-reading">\nThe lease runs five years.');
    expect(prompt).toContain('("Answer key")');
    expect(prompt).toContain('<material role="ai-only-guide">\nWaiting is better');
  });

  it("is no suggestion when the model fails, answers off-schema, or answers blank", async () => {
    const failing = new MockLanguageModelV4({
      modelId: "test/grader",
      doGenerate: async () => {
        throw new Error("gateway down");
      },
    });
    expect(await suggestGoal(db, failing, {}, harbor)).toEqual({ ok: false });
    expect(await suggestGoal(db, answering({ nope: 1 }), {}, harbor)).toEqual({ ok: false });
    expect(await suggestGoal(db, answering({ goal: "   " }), {}, harbor)).toEqual({ ok: false });
    expect(await suggestGoal(db, answering({ goal: "x".repeat(601) }), {}, harbor)).toEqual({ ok: false });
    expect((await ledger()).map((r) => r.purpose)).toEqual(Array(4).fill("suggest.goal"));
  });

  it("asks nothing when there's no reading text", async () => {
    const model = answering({ goal: "Anything" });
    expect(await suggestGoal(db, model, {}, { readings: [{ name: "Empty", body: "  " }], guides: [] })).toEqual({ ok: false });
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

describe("suggestTypes", () => {
  let db: Db;
  const goal = "Recommend whether Harbor Bikes should open a second store.";

  beforeAll(async () => {
    db = await testDb();
  });
  beforeEach(async () => {
    await db.query("delete from ai_calls");
  });

  it("gives the top three modes with their reasons in one call, recorded as suggest.type", async () => {
    const model = answering({
      types: [
        { mode: "case-chat", reason: " Maya's decision is\n a real case to work through. " },
        { mode: "debate", reason: "There are two sides: open now or wait." },
        { mode: "explain", reason: "Students can explain the cash-flow squeeze." },
        { mode: "pitch", reason: "A fourth one is too many." },
      ],
    });
    expect(await suggestTypes(db, model, {}, harbor, goal)).toEqual([
      { mode: "case-chat", reason: "Maya's decision is a real case to work through." },
      { mode: "debate", reason: "There are two sides: open now or wait." },
      { mode: "explain", reason: "Students can explain the cash-flow squeeze." },
    ]);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(sent(model)).toContain("Harbor Bikes sells 1,200 bikes a year.");
    const [{ purpose }] = await db.query<{ purpose: string }>("select purpose from ai_calls");
    expect(purpose).toBe("suggest.type");
  });

  it("drops modes that don't exist and repeats, and keeps a mode whose reason is unusable without it", async () => {
    const model = answering({
      types: [
        { mode: "lecture", reason: "Not a mode." },
        { mode: "Debate", reason: "Two sides." },
        { mode: "debate", reason: "Again." },
        { mode: "socratic", reason: "  " },
      ],
    });
    expect(await suggestTypes(db, model, {}, harbor, goal)).toEqual([
      { mode: "debate", reason: "Two sides." },
      { mode: "socratic", reason: null },
    ]);
  });

  it("falls back to Explain when the model fails or names no real mode", async () => {
    const failing = new MockLanguageModelV4({
      modelId: "test/grader",
      doGenerate: async () => {
        throw new Error("gateway down");
      },
    });
    const explain = [{ mode: "explain", reason: null }];
    expect(await suggestTypes(db, failing, {}, harbor, goal)).toEqual(explain);
    expect(await suggestTypes(db, answering({ types: [{ mode: "lecture", reason: "No." }] }), {}, harbor, goal)).toEqual(explain);
    expect(await suggestTypes(db, answering({ types: [] }), {}, harbor, goal)).toEqual(explain);
    expect(await suggestTypes(db, answering({ nope: 1 }), {}, harbor, goal)).toEqual(explain);
  });

  it("asks with every mode, the teacher's goal, and each material fenced", () => {
    const { prompt } = typePrompt({ ...harbor, guides: [{ name: "Answer key", body: "Wait." }] }, goal);
    expect(prompt).toContain("- case-chat: Case Chat.");
    expect(prompt).toContain("- defend: Defend.");
    expect(prompt).toContain(`they should be able to: ${goal}`);
    expect(prompt).toContain('Material title: Case: Harbor Bikes\n<material role="student-reading">');
    expect(prompt).toContain('<material role="ai-only-guide">\nWait.');
  });
});
