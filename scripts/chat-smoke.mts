/**
 * One real Study Chat through `src/tools/study-chat/chat.ts`, with CHAT_MODEL
 * for the replies and the question check. Makes a throwaway course, teacher,
 * student and published chat (the Harbor Bikes case, ending on a question),
 * sends scripted student messages, and prints the streamed replies and how the
 * chat ended. The rows stay so the transcript can be graded later; every one
 * is named `smoke.<time>`. Run against a local database only.
 *   npx tsx --env-file=.env.local scripts/chat-smoke.mts
 */

import { randomUUID } from "node:crypto";
import { chatModel } from "../src/ai/models";
import { PRACTICE_PAGES } from "../src/canvas/practice/data";
import { saveContent } from "../src/content/store";
import { db } from "../src/db/client";
import { databaseUrl } from "../src/db/url";
import type { Actor } from "../src/db/scope";
import { readChat, sendTurn } from "../src/tools/study-chat/chat";
import { STUDY_CHAT } from "../src/tools/study-chat/create";
import { draft } from "../src/tools/study-chat/test-fixtures";

if (!/@(127\.0\.0\.1|localhost):/.test(databaseUrl())) {
  console.error("chat-smoke writes throwaway rows: point DATABASE_URL at a local database.");
  process.exit(1);
}

const tag = `smoke.${Date.now()}`;
const [{ id: inst }] = await db().query<{ id: string }>("select id from institutions order by created_at limit 1");
const person = async (role: string, isStaff: boolean): Promise<Actor> => {
  const netId = `${tag}.${role}`;
  const [{ id }] = await db().query<{ id: string }>(
    "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
    [inst, netId],
  );
  return { userId: id, institutionId: inst, netId, displayName: netId, isStaff, isAdmin: false };
};
const teacher = await person("teacher", true);
const student = await person("student", false);
const [{ id: course }] = await db().query<{ id: string }>(
  "insert into courses (institution_id, code, title, term, created_by) values ($1, $2, $2, 'Smoke', $3) returning id",
  [inst, tag, teacher.userId],
);
await db().query(
  "insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor'), ($1, $3, 'student')",
  [course, teacher.userId, student.userId],
);
const page = PRACTICE_PAGES.get(1101)!.find((p) => p.url === "case-harbor-bikes")!;
const saved = await saveContent(db(), teacher, course, randomUUID(), { kind: "canvas-page", name: page.title, html: page.body ?? "" });
if (!saved.ok) throw new Error(saved.reason);
const settings = draft({
  completion: {
    maxTurns: 6,
    timeLimitMinutes: null,
    question: "Should Harbor Bikes open the second store now or wait?",
    studentCanFinish: true,
  },
});
const [{ id: activity }] = await db().query<{ id: string }>(
  `insert into activities (course_id, tool, title, settings, status, points, content_id, created_by)
   values ($1, $2, $3, $4::text::jsonb, 'published', 10, $5, $6) returning id`,
  [course, STUDY_CHAT, tag, JSON.stringify(settings), saved.content.id, teacher.userId],
);

const messages = [
  "Hi Maya. Before we talk about the second store, how has cash flow looked across the year?",
  "What would the second store cost up front, and how long until it pays for itself?",
  "My recommendation: wait. Fix the seasonal cash squeeze first, then open the second store next year once you have a cash cushion.",
  "To be clear, my answer is to wait on the second store until cash flow is steadier.",
];
const models = { reply: chatModel(), check: chatModel() };
console.log(`Activity ${activity} (${tag}), CHAT_MODEL=${process.env.CHAT_MODEL}\n`);
for (const message of messages) {
  console.log(`Student: ${message}`);
  const result = await sendTurn(db(), models, student, activity, { clientKey: randomUUID(), message });
  if (result.kind === "refused") {
    console.log(`(refused: ${result.reason})`);
    break;
  }
  if (result.kind === "replay") throw new Error("A new key was answered as a replay");
  let chunks = 0;
  process.stdout.write("Maya: ");
  for await (const part of result.textStream) {
    chunks++;
    process.stdout.write(part);
  }
  const outcome = await result.done;
  console.log(`\n(${chunks} chunks streamed)\n`);
  if (!outcome.ok) throw new Error(outcome.reason);
  if (outcome.attempt.status === "completed") {
    console.log(`Chat ended by: ${outcome.attempt.endedBy}`);
    break;
  }
}

const chat = await readChat(db(), student, activity);
console.log(`Attempt ${chat?.attempt?.id}: ${chat?.attempt?.status}, ended by ${chat?.attempt?.endedBy}, ${chat?.turns.length} turns`);
console.table(
  await db().query(
    `select purpose, model, ok, input_tokens, output_tokens, cost_usd::text from ai_calls
      where course_id = $1 or (purpose = 'chat.check' and user_id = $2) order by created_at`,
    [course, student.userId],
  ),
);
process.exit(chat?.attempt?.endedBy === "question" ? 0 : 1);
