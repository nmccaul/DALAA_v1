/**
 * One real call to each model through `src/ai/`, to check the gateway key and
 * model names work. Writes `ai_calls` rows like any other call.
 *   npx tsx --env-file=.env.local scripts/ai-smoke.mts
 */

import { generateReply } from "../src/ai/call";
import { chatModel, graderModel } from "../src/ai/models";
import { db } from "../src/db/client";

const prompt = { prompt: "Reply with one short sentence about bicycles." };

for (const [name, model] of [
  ["CHAT_MODEL", chatModel()],
  ["GRADER_MODEL", graderModel()],
] as const) {
  const text = await generateReply(db(), model, { purpose: "smoke" }, prompt);
  console.log(`${name}: ${text.trim()}`);
}

const rows = await db().query<{ model: string; ok: boolean; input_tokens: number | null; cost_usd: string | null }>(
  "select model, ok, input_tokens, cost_usd::text from ai_calls where purpose = 'smoke' order by created_at desc limit 2",
);
console.table(rows);
process.exit(0);
