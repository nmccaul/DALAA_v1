/**
 * One real grade through `src/tools/study-chat/grade.ts`, with GRADER_MODEL.
 * Grades the attempt given (or the newest finished `smoke.` chat from
 * `scripts/chat-smoke.mts` with no grade yet), then prints the stored result,
 * which quotes survived the evidence check, and the grader's ledger rows. Run
 * against a local database only.
 *   npx tsx --env-file=.env.local scripts/grade-smoke.mts [attemptId]
 */

import { graderModel } from "../src/ai/models";
import { db } from "../src/db/client";
import { databaseUrl } from "../src/db/url";
import { gradeAttempt } from "../src/tools/study-chat/grade";

if (!/@(127\.0\.0\.1|localhost):/.test(databaseUrl())) {
  console.error("grade-smoke writes a result: point DATABASE_URL at a local database.");
  process.exit(1);
}

const attemptId =
  process.argv[2] ??
  (
    await db().query<{ id: string }>(
      `select a.id from attempts a
         join activities act on act.id = a.activity_id
         left join results r on r.attempt_id = a.id
        where a.status = 'completed' and act.title like 'smoke.%' and (r.attempt_id is null or r.status = 'failed')
        order by a.created_at desc limit 1`,
    )
  )[0]?.id;
if (!attemptId) {
  console.error("No ungraded smoke chat: run scripts/chat-smoke.mts first, or pass an attempt id.");
  process.exit(1);
}

console.log(`Grading attempt ${attemptId}, GRADER_MODEL=${process.env.GRADER_MODEL}\n`);
const started = new Date();
const result = await gradeAttempt(db(), graderModel(), attemptId);
if (!result) throw new Error("Not a finished Study Chat attempt");
console.log(`Status: ${result.status}`);
if (result.status === "graded") {
  console.log(`Score: ${result.score} of ${result.maxScore}\nPosition: ${result.position ?? "(none)"}\nFeedback: ${result.feedback}\n`);
  for (const c of result.criteria) {
    console.log(`- ${c.label}: ${c.score}/${c.max} — ${c.feedback}\n  quote: ${c.evidence ?? "(none survived)"}`);
  }
  for (const t of result.touchpoints) {
    console.log(`- touchpoint ${t.label}: ${t.hit ? "hit" : "missed"} — quote: ${t.evidence ?? "(none)"}`);
  }
}
console.table(
  await db().query(
    `select purpose, model, ok, input_tokens, output_tokens, cost_usd::text from ai_calls
      where purpose = 'grade' and created_at >= $1 order by created_at`,
    [started],
  ),
);
process.exit(result.status === "graded" ? 0 : 1);
