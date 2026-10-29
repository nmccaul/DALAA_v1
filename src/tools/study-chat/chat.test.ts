import { randomUUID } from "node:crypto";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { startAttempt } from "@/attempts/store";
import { saveContent } from "@/content/store";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { finishChat, readChat, sendTurn, type ChatModels, type SendResult } from "./chat";
import { STUDY_CHAT } from "./create";
import type { StudyChatSettings } from "./schema";
import { answering, draft } from "./test-fixtures";

const usage = {
  inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};
const stop = { unified: "stop", raw: undefined } as const;

/** A chat model that streams "Reply 1", "Reply 2", … and can be told to fail. */
function chatModel() {
  let calls = 0;
  const state = { failing: false };
  const model = new MockLanguageModelV4({
    modelId: "test/chat",
    doStream: async () => {
      if (state.failing) throw new Error("provider down");
      const text = `Reply ${++calls}`;
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: text },
            { type: "text-end", id: "t" },
            { type: "finish", finishReason: stop, usage },
          ],
        }),
      };
    },
  });
  return Object.assign(model, { state });
}

async function settle(result: SendResult) {
  if (result.kind !== "stream") return result;
  let streamed = "";
  for await (const part of result.textStream) streamed += part;
  return { ...(await result.done), streamed };
}

describe("a student's Study Chat", () => {
  let db: Db;
  let student: Actor;
  let outsider: Actor;
  let course: string;
  let activity: string;
  let models: ChatModels & { reply: ReturnType<typeof chatModel> };

  const actor = async (inst: string, netId: string, isStaff: boolean): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff, isAdmin: false };
  };

  const setSettings = (settings: StudyChatSettings) =>
    db.query("update activities set settings = $2::text::jsonb where id = $1", [activity, JSON.stringify(settings)]);
  const send = (message: string, clientKey: string = randomUUID()) =>
    sendTurn(db, models, student, activity, { clientKey, message }).then(settle);
  const turns = () => db.query<{ status: string }>("select status from chat_turns order by sent_at");
  const replyCalls = () => db.query("select id from ai_calls where purpose = 'chat.reply' and ok");

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const prof = await actor(inst, "prof", true);
    student = await actor(inst, "student", false);
    outsider = await actor(inst, "outsider", false);
    [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, prof.userId],
    );
    await db.query(
      "insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor'), ($1, $3, 'student')",
      [course, prof.userId, student.userId],
    );
    const saved = await saveContent(db, prof, course, randomUUID(), { kind: "paste", name: "Case", text: "Harbor Bikes sells bikes." });
    if (!saved.ok) throw new Error(saved.reason);
    [{ id: activity }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, status, points, content_id, created_by)
       values ($1, $2, 'Second store', $3::text::jsonb, 'published', 10, $4, $5) returning id`,
      [course, STUDY_CHAT, JSON.stringify(draft()), saved.content.id, prof.userId],
    );
    models = { reply: chatModel(), check: answering({ answered: false }) };
  });

  it("streams a reply, saves the turn, and sends the material and history to the model", async () => {
    expect(await send("Hi Maya")).toMatchObject({ ok: true, reply: "Reply 1", streamed: "Reply 1" });
    expect(await send("Tell me about cash")).toMatchObject({ ok: true, reply: "Reply 2" });

    const sent = models.reply.doStreamCalls[1].prompt;
    expect(JSON.stringify(sent[0])).toContain("Harbor Bikes sells bikes.");
    expect(sent.slice(1).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(await readChat(db, student, activity)).toMatchObject({
      attempt: { status: "in_progress", endedBy: null },
      turns: [
        { message: "Hi Maya", reply: "Reply 1" },
        { message: "Tell me about cash", reply: "Reply 2" },
      ],
    });
    expect(await replyCalls()).toHaveLength(2);
  });

  it("answers a retried message with its first reply, without another model call", async () => {
    const key = randomUUID();
    await send("Hi", key);
    expect(await sendTurn(db, models, student, activity, { clientKey: key, message: "Hi" })).toMatchObject({
      kind: "replay",
      reply: "Reply 1",
    });
    expect(models.reply.doStreamCalls).toHaveLength(1);
    expect(await turns()).toHaveLength(1);
  });

  it("doesn't count a failed reply, and the same message can be sent again", async () => {
    const key = randomUUID();
    models.reply.state.failing = true;
    expect(await send("Hi", key)).toMatchObject({ ok: false, reason: expect.stringContaining("won't count against you") });
    expect(await turns()).toEqual([{ status: "failed" }]);

    models.reply.state.failing = false;
    expect(await send("Hi", key)).toMatchObject({ ok: true, reply: "Reply 1" });
    expect(await turns()).toEqual([{ status: "done" }]);
  });

  it("takes one message at a time, and frees a turn whose request died", async () => {
    const attempt = await startAttempt(db, student, activity);
    await db.query("insert into chat_turns (attempt_id, client_key, message) values ($1, $2, 'stuck')", [attempt!.id, randomUUID()]);
    expect(await send("Second")).toEqual({ kind: "refused", reason: "Wait for the reply to your last message." });

    await db.query("update chat_turns set sent_at = now() - interval '5 minutes'");
    expect(await send("Second")).toMatchObject({ ok: true });
    expect(await turns()).toEqual([{ status: "failed" }, { status: "done" }]);
  });

  it("ends after the most messages, and refuses more", async () => {
    await setSettings(draft({ completion: { maxTurns: 2, timeLimitMinutes: null, question: null, studentCanFinish: false } }));
    expect(await send("One")).toMatchObject({ ok: true, attempt: { status: "in_progress" } });
    expect(await send("Two")).toMatchObject({ ok: true, attempt: { status: "completed", endedBy: "turns" } });
    expect(await send("Three")).toEqual({ kind: "refused", reason: "This chat has ended: you've used all your messages." });
    expect(models.reply.doStreamCalls).toHaveLength(2);
  });

  it("ends when time is up", async () => {
    await setSettings(draft({ completion: { maxTurns: null, timeLimitMinutes: 10, question: null, studentCanFinish: false } }));
    await send("One");
    await db.query("update attempts set started_at = now() - interval '11 minutes'");
    expect(await send("Two")).toEqual({ kind: "refused", reason: "This chat has ended: time's up." });
    expect(await readChat(db, student, activity)).toMatchObject({ attempt: { status: "completed", endedBy: "time" } });
  });

  it("ends once the check says the question is answered, and a failed check ends nothing", async () => {
    await setSettings(draft({ completion: { maxTurns: null, timeLimitMinutes: null, question: "Open or wait?", studentCanFinish: false } }));
    models.check = answering("not json");
    expect(await send("Maybe")).toMatchObject({ ok: true, attempt: { status: "in_progress" } });

    models.check = answering({ answered: true });
    expect(await send("Wait: cash flow first.")).toMatchObject({ ok: true, attempt: { status: "completed", endedBy: "question" } });
    expect(JSON.stringify((models.check as MockLanguageModelV4).doGenerateCalls[0].prompt)).toContain("Wait: cash flow first.");
  });

  it("lets the student finish only when allowed and after a message", async () => {
    expect(await finishChat(db, student, activity)).toEqual({ ok: false, reason: "Send a message before you finish." });
    await send("One");
    expect(await finishChat(db, student, activity)).toMatchObject({ ok: true, attempt: { status: "completed", endedBy: "student" } });
    expect(await send("Two")).toEqual({ kind: "refused", reason: "You've finished this chat." });

    await db.query("delete from attempts");
    await setSettings(draft({ completion: { maxTurns: 5, timeLimitMinutes: null, question: null, studentCanFinish: false } }));
    await send("One");
    expect(await finishChat(db, student, activity)).toEqual({ ok: false, reason: "This chat ends on its own." });
  });

  it("is only for active students of the course, and only once published", async () => {
    const refused = { kind: "refused", reason: "We couldn't find that assignment." };
    expect(await sendTurn(db, models, outsider, activity, { clientKey: randomUUID(), message: "Hi" })).toEqual(refused);
    await db.query("update course_members set status = 'flagged' where user_id = $1", [student.userId]);
    expect(await send("Hi")).toEqual(refused);
    await db.query("update course_members set status = 'active'");
    await db.query("update activities set status = 'draft'");
    expect(await send("Hi")).toEqual(refused);
    expect(await readChat(db, student, activity)).toBeNull();
    expect(models.reply.doStreamCalls).toHaveLength(0);
  });

  it("refuses an empty or overlong message without starting anything", async () => {
    expect(await send("   ")).toEqual({ kind: "refused", reason: "Write a message first." });
    expect(await send("x".repeat(4001))).toMatchObject({ kind: "refused" });
    expect(await db.query("select id from attempts")).toHaveLength(0);
  });
});
