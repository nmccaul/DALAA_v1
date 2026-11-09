import { MockLanguageModelV4 } from "ai/test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { goalPrompt, suggestGoal } from "./suggest";
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
