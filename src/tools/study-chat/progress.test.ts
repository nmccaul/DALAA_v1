import { randomUUID } from "node:crypto";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { saveContent } from "@/content/store";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { readChat, sendTurn, type ChatModels, type SendResult } from "./chat";
import { STUDY_CHAT } from "./create";
import { readProgress, trackProgress } from "./progress";
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
          { type: "text-delta", id: "t", delta: "Go on." },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
        ],
      }),
    }),
  });

/** A check model that answers the tracking call with `track` (or fails when it's "fail") and the question check with "not yet". */
function checkModel(state: { track: unknown }) {
  return new MockLanguageModelV4({
    modelId: "test/check",
    doGenerate: async (options) => {
      const tracking = JSON.stringify(options.prompt).includes("You follow a conversation");
      if (tracking && state.track === "fail") throw new Error("provider down");
      const answer = tracking ? state.track : { answered: false, awaitingStudent: false };
      return {
        content: [{ type: "text", text: JSON.stringify(answer) }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

async function settle(result: SendResult) {
  if (result.kind !== "stream") return result;
  await Array.fromAsync(result.textStream);
  return result.done;
}

const settings = draft({
  touchpoints: [
    { label: "Cash flow", description: "Notices the seasonal cash squeeze." },
    { label: "Lease terms", description: "Asks about the lease." },
  ],
});

describe("live touchpoint tracking", () => {
  let db: Db;
  let student: Actor;
  let activity: string;
  let state: { track: unknown };
  let models: ChatModels;

  const send = (message: string) =>
    sendTurn(db, models, student, activity, { clientKey: randomUUID(), message }).then(settle);
  const progress = async () => {
    const [{ id }] = await db.query<{ id: string }>("select id from attempts");
    return readProgress(db, id);
  };
  const trackCalls = () => db.query<{ ok: boolean }>("select ok from ai_calls where purpose = 'chat.track' order by created_at");

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const [{ id: prof }, { id: stu }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'prof', 'Prof'), ($1, 'stu', 'Stu') returning id",
      [inst],
    );
    const teacher: Actor = { userId: prof, institutionId: inst, netId: "prof", displayName: "Prof", isStaff: true, isAdmin: false };
    student = { userId: stu, institutionId: inst, netId: "stu", displayName: "Stu", isStaff: false, isAdmin: false };
    const [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, prof],
    );
    await db.query(
      "insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor'), ($1, $3, 'student')",
      [course, prof, stu],
    );
    const saved = await saveContent(db, teacher, course, randomUUID(), { kind: "paste", name: "Case", text: "Harbor Bikes." });
    if (!saved.ok) throw new Error(saved.reason);
    [{ id: activity }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, status, points, content_id, created_by)
       values ($1, $2, 'Second store', $3::text::jsonb, 'published', 10, $4, $5) returning id`,
      [course, STUDY_CHAT, JSON.stringify(settings), saved.content.id, prof],
    );
    state = { track: { touchpoints: [], position: null } };
    models = { reply: chatModel(), check: checkModel(state) };
  });

  it("stores what the check says the student covered, keeping touchpoints once covered and the latest position", async () => {
    state.track = { touchpoints: ["cash  FLOW", "Something else"], position: "Wait" };
    await send("Cash is tight in winter, so wait.");
    expect(await progress()).toEqual({ touchpoints: [{ key: "cash flow", label: "Cash flow" }], position: { key: "wait", label: "Wait" } });

    state.track = { touchpoints: ["Lease terms"], position: null };
    await send("What does the lease say?");
    expect(await progress()).toEqual({
      touchpoints: [
        { key: "cash flow", label: "Cash flow" },
        { key: "lease terms", label: "Lease terms" },
      ],
      position: { key: "wait", label: "Wait" },
    });

    state.track = { touchpoints: [], position: "Open it" };
    await send("Actually, open it now.");
    expect((await progress()).position).toEqual({ key: "open it", label: "Open it" });
    expect(await trackCalls()).toHaveLength(3);
  });

  it("adds nothing when the same turn is tracked again", async () => {
    state.track = { touchpoints: ["Cash flow"], position: "Wait" };
    await send("Cash is tight.");
    const [{ id: attemptId }] = await db.query<{ id: string }>("select id from attempts");
    const [{ id: turnId }] = await db.query<{ id: string }>("select id from chat_turns");
    const before = await db.query("select * from chat_touchpoints");
    const ctx = { purpose: "chat.track", userId: student.userId, courseId: null };
    await trackProgress(db, models.check, ctx, settings, attemptId, turnId, [{ message: "Cash is tight.", reply: "Go on." }]);
    expect(await db.query("select * from chat_touchpoints")).toEqual(before);
    expect(await db.query("select key from chat_positions")).toEqual([{ key: "wait" }]);
  });

  it("keeps labels as they were in the attempt's settings after the teacher renames one (D-031)", async () => {
    state.track = { touchpoints: ["Cash flow"], position: null };
    await send("Cash is tight.");
    const renamed = { ...settings, touchpoints: [{ label: "Seasonality", description: "Cash squeeze." }] };
    await db.query("update activities set settings = $2::text::jsonb where id = $1", [activity, JSON.stringify(renamed)]);
    state.track = { touchpoints: ["Lease terms"], position: null };
    await send("And the lease?");
    expect((await progress()).touchpoints.map((t) => t.label)).toEqual(["Cash flow", "Lease terms"]);
  });

  it("costs the student nothing when the check fails: the reply stands, the turn counts, nothing is stored", async () => {
    state.track = "fail";
    expect(await send("Cash is tight.")).toMatchObject({ ok: true, reply: "Go on." });
    state.track = "not json";
    expect(await send("Lease?")).toMatchObject({ ok: true, reply: "Go on." });
    expect((await readChat(db, student, activity))?.turns).toHaveLength(2);
    expect(await progress()).toEqual({ touchpoints: [], position: null });
    expect((await trackCalls()).map((c) => c.ok)).toEqual([false, true]);
  });

  it("still tracks the turn that ends the chat", async () => {
    await db.query("update activities set settings = $2::text::jsonb where id = $1", [
      activity,
      JSON.stringify({ ...settings, completion: { ...settings.completion, maxTurns: 1 } }),
    ]);
    state.track = { touchpoints: ["Cash flow"], position: null };
    expect(await send("Cash is tight.")).toMatchObject({ ok: true, attempt: { status: "completed", endedBy: "turns" } });
    expect((await progress()).touchpoints).toHaveLength(1);
  });

  it("makes no tracking call for a chat with no touchpoints or positions", async () => {
    const bare = { ...settings, touchpoints: [], positions: [] };
    await db.query("update activities set settings = $2::text::jsonb where id = $1", [activity, JSON.stringify(bare)]);
    models.check = answering({ answered: false, awaitingStudent: false });
    await send("Hi");
    expect(await trackCalls()).toHaveLength(0);
  });

  describe("the student's meter", () => {
    const show = (on: boolean) =>
      db.query("update activities set settings = $2::text::jsonb where id = $1", [activity, JSON.stringify({ ...settings, showProgress: on })]);

    it("sends nothing tracked to the student when the teacher hasn't turned it on", async () => {
      await show(false);
      expect((await readChat(db, student, activity))?.progress).toBeNull();
      state.track = { touchpoints: ["Cash flow"], position: "Wait" };
      expect(await send("Cash is tight, so wait.")).toMatchObject({ ok: true, progress: null });
      expect((await readChat(db, student, activity))?.progress).toBeNull();
    });

    it("counts touchpoints covered and names the student's position when it's on, after each reply", async () => {
      await show(true);
      expect((await readChat(db, student, activity))?.progress).toEqual({ points: { covered: 0, total: 2 }, position: null });
      state.track = { touchpoints: ["Cash flow"], position: null };
      expect(await send("Cash is tight.")).toMatchObject({ ok: true, progress: { points: { covered: 1, total: 2 }, position: null } });
      state.track = { touchpoints: ["Lease terms"], position: "Wait" };
      expect(await send("Lease is long, so wait.")).toMatchObject({ progress: { points: { covered: 2, total: 2 }, position: "Wait" } });
      expect((await readChat(db, student, activity))?.progress).toEqual({ points: { covered: 2, total: 2 }, position: "Wait" });
    });

    it("shows a replayed turn the same meter", async () => {
      await show(true);
      state.track = { touchpoints: ["Cash flow"], position: null };
      const key = randomUUID();
      await sendTurn(db, models, student, activity, { clientKey: key, message: "Cash." }).then(settle);
      const replay = await sendTurn(db, models, student, activity, { clientKey: key, message: "Cash." });
      expect(replay).toMatchObject({ kind: "replay", progress: { points: { covered: 1, total: 2 }, position: null } });
    });
  });
});
