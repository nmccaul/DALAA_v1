/**
 * The one way DALAA calls a model (D-026). Every helper here writes one
 * `ai_calls` row per real model call — including retries and calls that
 * failed — with tokens and cost NULL when the provider didn't say (never 0).
 *
 * Callers pass the model (`chatModel()` / `graderModel()` in the app, a mock in
 * tests) and who the call was for. Prompts and replies are never logged.
 */

import { generateText, Output, streamText, type LanguageModel, type LanguageModelUsage, type ModelMessage } from "ai";
import type { z } from "zod";
import type { Db } from "@/db/types";

/** Who a call was for, so the ledger can be read per course and per student. */
export type AiCallContext = {
  /** What the call is for, e.g. 'chat.reply', 'grade', 'draft'. */
  purpose: string;
  userId?: string | null;
  courseId?: string | null;
};

type Prompt = { system?: string } & ({ prompt: string } | { messages: ModelMessage[] });

/**
 * The AI Gateway reports what it charged as `providerMetadata.gateway.cost`
 * (a decimal string). Anything else, or nothing, is an unknown cost: NULL.
 */
export function gatewayCost(providerMetadata: unknown): string | null {
  const cost = (providerMetadata as { gateway?: { cost?: unknown } } | undefined)?.gateway?.cost;
  const text = typeof cost === "number" ? String(cost) : cost;
  return typeof text === "string" && /^\d+(\.\d+)?$/.test(text) ? text : null;
}

function generationId(providerMetadata: unknown): string | null {
  const id = (providerMetadata as { gateway?: { generationId?: unknown } } | undefined)?.gateway?.generationId;
  return typeof id === "string" && id !== "" ? id : null;
}

type LedgerRow = {
  model: string;
  ok: boolean;
  usage?: LanguageModelUsage;
  providerMetadata?: unknown;
};

/**
 * Writes one ledger row. A ledger failure is logged, not thrown: it must not
 * cost the student their turn.
 */
async function record(db: Db, ctx: AiCallContext, row: LedgerRow): Promise<void> {
  try {
    await db.query(
      `insert into ai_calls (purpose, model, user_id, course_id, ok, input_tokens, output_tokens, cost_usd, generation_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ctx.purpose,
        row.model,
        ctx.userId ?? null,
        ctx.courseId ?? null,
        row.ok,
        row.usage?.inputTokens ?? null,
        row.usage?.outputTokens ?? null,
        gatewayCost(row.providerMetadata),
        generationId(row.providerMetadata),
      ],
    );
  } catch (error) {
    console.error(`ai_calls: could not record a ${ctx.purpose} call:`, error instanceof Error ? error.message : error);
  }
}

/**
 * The ledger callbacks for one generateText/streamText call. `settled` resolves
 * once every row they started has been written, so a caller (or a test) can
 * wait for the ledger without racing the stream.
 */
function ledger(db: Db, ctx: AiCallContext) {
  const writes: Promise<void>[] = [];
  return {
    callbacks: {
      onLanguageModelCallEnd: (e: { modelId: string; usage: LanguageModelUsage; providerMetadata?: unknown }) => {
        writes.push(record(db, ctx, { model: e.modelId, ok: true, usage: e.usage, providerMetadata: e.providerMetadata }));
      },
      onStepError: (e: { modelId: string }) => {
        writes.push(record(db, ctx, { model: e.modelId, ok: false }));
      },
    },
    settled: async () => {
      await Promise.all(writes);
    },
  };
}

/** A whole text reply at once. */
export async function generateReply(
  db: Db,
  model: LanguageModel,
  ctx: AiCallContext,
  prompt: Prompt,
): Promise<string> {
  const { callbacks, settled } = ledger(db, ctx);
  try {
    const result = await generateText({ model, ...prompt, ...callbacks });
    return result.text;
  } finally {
    await settled();
  }
}

/**
 * A text reply as it's written, for the student chat. Read `textStream` (or
 * hand the result to a route response); `done` resolves with the full text
 * once the ledger is written, or rejects if the call failed.
 */
export function streamReply(db: Db, model: LanguageModel, ctx: AiCallContext, prompt: Prompt) {
  const { callbacks, settled } = ledger(db, ctx);
  let failure: unknown;
  const result = streamText({
    model,
    ...prompt,
    ...callbacks,
    onError: ({ error }) => {
      failure = error;
    },
  });
  const done = (async () => {
    try {
      // On a failed call the SDK rejects `text` with a generic "No output
      // generated"; the provider's own error from onError is the one to report.
      const text = await Promise.resolve(result.text).catch((error: unknown) => {
        throw failure ?? error;
      });
      if (failure) throw failure;
      return text;
    } finally {
      await settled();
    }
  })();
  done.catch(() => {}); // a caller that only streams still gets the failure through `done`
  return { textStream: result.textStream, result, done };
}

/** An object matching `schema` (drafting settings, grading). Throws if the model's answer doesn't validate. */
export async function generateStructured<S extends z.ZodType>(
  db: Db,
  model: LanguageModel,
  ctx: AiCallContext,
  schema: S,
  prompt: Prompt,
): Promise<z.infer<S>> {
  const { callbacks, settled } = ledger(db, ctx);
  try {
    const result = await generateText({ model, ...prompt, output: Output.object({ schema }), ...callbacks });
    return result.output as z.infer<S>;
  } finally {
    await settled();
  }
}
