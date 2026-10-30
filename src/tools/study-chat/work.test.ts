import { randomUUID } from "node:crypto";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_CHARS } from "@/content/read";
import { saveContent } from "@/content/store";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { addWork, readChat, sendTurn, type ChatModels, type SendResult } from "./chat";
import { STUDY_CHAT } from "./create";
import { gradePrompt } from "./grade";
import { ADD_WORK_FIRST } from "./student-messages";
import { answering, draft } from "./test-fixtures";

const usage = {
  inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

const chatModel = () =>
  new MockLanguageModelV4({
    modelId: "test/chat",
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "Tell me about your thesis." },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
        ],
      }),
    }),
  });

async function settle(result: SendResult) {
  if (result.kind !== "stream") return result;
  await Array.fromAsync(result.textStream);
  return result.done;
}

const ESSAY = "My essay argues Harbor Bikes should wait a year before opening a second store.";

describe("students bring their own work", () => {
  let db: Db;
  let amy: Actor;
  let ben: Actor;
  let activity: string;
  let models: ChatModels & { reply: ReturnType<typeof chatModel> };

  const actor = async (inst: string, netId: string, isStaff: boolean): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff, isAdmin: false };
  };
  const paste = (text: string) => ({ kind: "paste" as const, name: "Essay", text });
  const send = (who: Actor, message: string) =>
    sendTurn(db, models, who, activity, { clientKey: randomUUID(), message }).then(settle);
  const attempts = () => db.query("select id from attempts");

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const prof = await actor(inst, "prof", true);
    amy = await actor(inst, "amy", false);
    ben = await actor(inst, "ben", false);
    const [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, prof.userId],
    );
    await db.query(
      "insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor'), ($1, $3, 'student'), ($1, $4, 'student')",
      [course, prof.userId, amy.userId, ben.userId],
    );
    const saved = await saveContent(db, prof, course, randomUUID(), { kind: "paste", name: "Case", text: "Harbor Bikes sells bikes." });
    if (!saved.ok) throw new Error(saved.reason);
    [{ id: activity }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, status, points, content_id, created_by)
       values ($1, $2, 'Second store', $3::text::jsonb, 'published', 10, $4, $5) returning id`,
      [course, STUDY_CHAT, JSON.stringify(draft({ studentWork: true })), saved.content.id, prof.userId],
    );
    models = { reply: chatModel(), check: answering({ answered: false, awaitingStudent: false }) };
  });

  it("refuses a message before the work is in, and starts nothing", async () => {
    expect(await send(amy, "Hi")).toEqual({ kind: "refused", reason: ADD_WORK_FIRST });
    expect(await attempts()).toEqual([]);
    expect(models.reply.doStreamCalls).toHaveLength(0);
  });

  it("keeps each student's work with their own attempt and fences it for the chat model", async () => {
    expect(await addWork(db, amy, activity, paste(ESSAY))).toEqual({ ok: true, work: { name: "Essay", body: ESSAY } });
    expect(await addWork(db, ben, activity, paste("Ben's plan: open now."))).toMatchObject({ ok: true });

    const rows = await db.query<{ user_id: string; body: string }>(
      "select t.user_id, w.body from attempt_work w join attempts t on t.id = w.attempt_id order by w.body",
    );
    expect(rows).toEqual([
      { user_id: ben.userId, body: "Ben's plan: open now." },
      { user_id: amy.userId, body: ESSAY },
    ]);
    expect((await readChat(db, amy, activity))?.work).toEqual({ name: "Essay", body: ESSAY });

    expect(await send(amy, "Hi")).toMatchObject({ ok: true });
    const system = JSON.stringify(models.reply.doStreamCalls[0].prompt[0]);
    expect(system).toContain(`<material role=\\"student-work\\">\\n${ESSAY}\\n</material>`);
    expect(system).not.toContain("Ben's plan");
  });

  it("keeps the first work: adding again (a retry or a second file) changes nothing", async () => {
    await addWork(db, amy, activity, paste(ESSAY));
    expect(await addWork(db, amy, activity, paste("A different essay."))).toEqual({ ok: true, work: { name: "Essay", body: ESSAY } });
    expect(await db.query("select attempt_id from attempt_work")).toHaveLength(1);
  });

  it("holds the work to the content limits, and a refused upload starts nothing", async () => {
    const tooLong = await addWork(db, amy, activity, paste("a".repeat(MAX_CHARS + 1)));
    expect(tooLong).toMatchObject({ ok: false, reason: expect.stringContaining("the limit is 100,000") });
    expect(await addWork(db, amy, activity, paste("  \n "))).toEqual({ ok: false, reason: "Paste your work, or upload it as a file." });
    const exe = await addWork(db, amy, activity, { kind: "file", name: "essay.exe", bytes: new Uint8Array([1]) });
    expect(exe).toMatchObject({ ok: false });
    expect(await attempts()).toEqual([]);
    expect(await db.query("select attempt_id from attempt_work")).toEqual([]);
  });

  it("is refused for a chat that doesn't ask for it, and for someone outside the course", async () => {
    const [{ inst }] = await db.query<{ inst: string }>("select institution_id as inst from users where id = $1", [amy.userId]);
    const outsider = await actor(inst, "outsider", false);
    expect(await addWork(db, outsider, activity, paste(ESSAY))).toMatchObject({ ok: false });

    await db.query("update activities set settings = $2::text::jsonb where id = $1", [activity, JSON.stringify(draft())]);
    expect(await addWork(db, amy, activity, paste(ESSAY))).toEqual({ ok: false, reason: "This chat doesn't ask for your own work." });
    expect(await attempts()).toEqual([]);
  });

  it("gives the grader the work, fenced, as material to grade against", () => {
    const { prompt } = gradePrompt(draft({ studentWork: true }), [{ message: "Hi", reply: "Hello" }], null, { name: "Essay", body: ESSAY }, null);
    expect(prompt).toContain(`<material role="student-work">\n${ESSAY}\n</material>`);
  });
});
