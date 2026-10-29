import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { testDb } from "@/test/db";
import type { Db } from "@/db/types";
import { gatewayCost, generateReply, generateStructured, streamReply } from "./call";

const usage = {
  inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};
const stop = { unified: "stop", raw: undefined } as const;

function replying(text: string, providerMetadata?: Record<string, Record<string, string>>) {
  return new MockLanguageModelV4({
    modelId: "test/model",
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: stop,
      usage,
      warnings: [],
      providerMetadata,
    }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          ...text.split(" ").map((w, i) => ({ type: "text-delta" as const, id: "t", delta: i ? ` ${w}` : w })),
          { type: "text-end", id: "t" },
          { type: "finish", finishReason: stop, usage, providerMetadata },
        ],
      }),
    }),
  });
}

const failing = new MockLanguageModelV4({
  modelId: "test/model",
  doGenerate: async () => {
    throw new Error("provider down");
  },
  doStream: async () => {
    throw new Error("provider down");
  },
});

type Row = {
  purpose: string;
  model: string;
  ok: boolean;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
  generation_id: string | null;
};

describe("AI calls", () => {
  let db: Db;
  const rows = () =>
    db.query<Row>(
      "select purpose, model, ok, input_tokens, output_tokens, cost_usd::text, generation_id from ai_calls order by created_at",
    );

  beforeAll(async () => {
    db = await testDb();
  });
  beforeEach(async () => {
    await db.query("delete from ai_calls");
  });

  it("returns the reply and writes one ledger row; unknown cost is NULL, not 0", async () => {
    const text = await generateReply(db, replying("Hello there"), { purpose: "chat.reply" }, { prompt: "Hi" });
    expect(text).toBe("Hello there");
    expect(await rows()).toEqual([
      {
        purpose: "chat.reply",
        model: "test/model",
        ok: true,
        input_tokens: 12,
        output_tokens: 5,
        cost_usd: null,
        generation_id: null,
      },
    ]);
  });

  it("records the gateway's cost and generation id when it reports them", async () => {
    const model = replying("ok", { gateway: { cost: "0.000321", generationId: "gen_1" } });
    await generateReply(db, model, { purpose: "draft" }, { prompt: "x" });
    const [row] = await rows();
    expect(row.cost_usd).toBe("0.000321");
    expect(row.generation_id).toBe("gen_1");
  });

  it("streams a reply and records it once the stream ends", async () => {
    const { textStream, done } = streamReply(db, replying("one two three"), { purpose: "chat.reply" }, {
      system: "Be brief.",
      messages: [{ role: "user", content: "Count" }],
    });
    const parts: string[] = [];
    for await (const part of textStream) parts.push(part);
    expect(parts.join("")).toBe("one two three");
    expect(await done).toBe("one two three");
    expect(await rows()).toHaveLength(1);
  });

  it("records a failed call with no tokens or cost, and the caller sees the failure", async () => {
    await expect(
      generateReply(db, failing, { purpose: "chat.reply" }, { prompt: "Hi" }),
    ).rejects.toThrow(/provider down/);
    const { done } = streamReply(db, failing, { purpose: "chat.reply" }, { prompt: "Hi" });
    await expect(done).rejects.toThrow(/provider down/);
    const all = await rows();
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const row of all) {
      expect(row).toMatchObject({ ok: false, input_tokens: null, output_tokens: null, cost_usd: null });
    }
  });

  it("returns a validated object, and refuses one that doesn't match the schema", async () => {
    const schema = z.object({ goal: z.string(), turns: z.number().int() });
    const good = await generateStructured(db, replying('{"goal":"Explain ROI","turns":6}'), { purpose: "draft" }, schema, {
      prompt: "Draft",
    });
    expect(good).toEqual({ goal: "Explain ROI", turns: 6 });
    await expect(
      generateStructured(db, replying('{"goal":"x","turns":"six"}'), { purpose: "draft" }, schema, { prompt: "Draft" }),
    ).rejects.toThrow();
    expect(await rows()).toHaveLength(2);
  });

  it("ties a call to its student and course", async () => {
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const [{ id: user }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'ai.student', 'S') returning id",
      [inst],
    );
    await generateReply(db, replying("ok"), { purpose: "chat.reply", userId: user }, { prompt: "x" });
    const [row] = await db.query<{ user_id: string; course_id: string | null }>("select user_id, course_id from ai_calls");
    expect(row).toEqual({ user_id: user, course_id: null });
  });

  it("rejects a malformed purpose and a negative cost", async () => {
    await expect(
      db.query("insert into ai_calls (purpose, model, ok) values ('Chat Reply', 'm', true)"),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query("insert into ai_calls (purpose, model, ok, cost_usd) values ('chat', 'm', true, -1)"),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("gatewayCost", () => {
  it("reads a decimal string or number and treats anything else as unknown", () => {
    expect(gatewayCost({ gateway: { cost: "0.0012" } })).toBe("0.0012");
    expect(gatewayCost({ gateway: { cost: 0.5 } })).toBe("0.5");
    expect(gatewayCost({ gateway: { cost: "" } })).toBeNull();
    expect(gatewayCost({ gateway: { cost: "-1" } })).toBeNull();
    expect(gatewayCost({ gateway: {} })).toBeNull();
    expect(gatewayCost(undefined)).toBeNull();
  });
});
