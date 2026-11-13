import { MockLanguageModelV4 } from "ai/test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { suggestGoalAndType, suggestPrompt } from "./suggest";
import { answering } from "./test-fixtures";

const sent = (model: MockLanguageModelV4) => JSON.stringify(model.doGenerateCalls[0].prompt);

const harbor = {
  readings: [{ name: "Case: Harbor Bikes", body: "Harbor Bikes sells 1,200 bikes a year. Maya must decide on a second store." }],
  guides: [],
};

const explainOnly = [{ mode: "explain", reason: null }];

describe("suggestGoalAndType", () => {
  let db: Db;
  const ledger = () => db.query<{ purpose: string; ok: boolean }>("select purpose, ok from ai_calls order by created_at");

  beforeAll(async () => {
    db = await testDb();
  });
  beforeEach(async () => {
    await db.query("delete from ai_calls");
  });

  it("suggests the goal and the two best types in one call, recorded as suggest.goal", async () => {
    const model = answering({
      goal: "  Recommend whether Harbor Bikes should open a second store,\n using the case's numbers. ",
      types: [
        { mode: "Case-Chat", reason: " The case has a decision  to make. " },
        { mode: "debate", reason: "There are two sides." },
        { mode: "socratic", reason: "A third is dropped." },
      ],
    });
    expect(await suggestGoalAndType(db, model, {}, harbor)).toEqual({
      goal: "Recommend whether Harbor Bikes should open a second store, using the case's numbers.",
      types: [
        { mode: "case-chat", reason: "The case has a decision to make." },
        { mode: "debate", reason: "There are two sides." },
      ],
    });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(sent(model)).toContain("Harbor Bikes sells 1,200 bikes a year.");
    expect(await ledger()).toEqual([{ purpose: "suggest.goal", ok: true }]);
  });

  it("drops modes that don't exist and repeats, and keeps a mode whose reason is unusable without it", async () => {
    const model = answering({
      goal: "Decide.",
      types: [
        { mode: "lecture", reason: "Not a mode." },
        { mode: "apply", reason: "x".repeat(301) },
        { mode: "apply", reason: "Again." },
      ],
    });
    expect((await suggestGoalAndType(db, model, {}, harbor)).types).toEqual([{ mode: "apply", reason: null }]);
  });

  it("is no goal and Explain when the model fails, answers off-schema, or answers blank", async () => {
    const failing = new MockLanguageModelV4({
      modelId: "test/grader",
      doGenerate: async () => {
        throw new Error("gateway down");
      },
    });
    const none = { goal: null, types: explainOnly };
    expect(await suggestGoalAndType(db, failing, {}, harbor)).toEqual(none);
    expect(await suggestGoalAndType(db, answering({ nope: 1 }), {}, harbor)).toEqual(none);
    expect(await suggestGoalAndType(db, answering({ goal: "   ", types: [] }), {}, harbor)).toEqual(none);
    expect((await suggestGoalAndType(db, answering({ goal: "x".repeat(601), types: [] }), {}, harbor)).goal).toBeNull();
    expect((await ledger()).map((r) => r.purpose)).toEqual(Array(4).fill("suggest.goal"));
  });

  it("asks nothing when there's no reading text", async () => {
    const model = answering({ goal: "Anything", types: [] });
    expect(await suggestGoalAndType(db, model, {}, { readings: [{ name: "Empty", body: "  " }], guides: [] })).toEqual({
      goal: null,
      types: explainOnly,
    });
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

describe("suggestPrompt", () => {
  it("lists every mode and fences every reading and AI-only note under its own name", () => {
    const { prompt } = suggestPrompt({
      readings: [...harbor.readings, { name: "Lease terms", body: "The lease runs five years." }],
      guides: [{ name: "Answer key", body: "Waiting is better: cash is short in winter." }],
    });
    expect(prompt).toContain("- case-chat: Case Chat.");
    expect(prompt).toContain("- defend: Defend.");
    expect(prompt).toContain('Material title: Case: Harbor Bikes\n<material role="student-reading">');
    expect(prompt).toContain('Material title: Lease terms\n<material role="student-reading">\nThe lease runs five years.');
    expect(prompt).toContain('("Answer key")');
    expect(prompt).toContain('<material role="ai-only-guide">\nWaiting is better');
  });
});
