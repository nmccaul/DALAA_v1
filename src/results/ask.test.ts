import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import { ASK_PURPOSE, ASK_REFUSED, ASKS_PER_DAY, askAboutClass, askPrompt, readHistory } from "./ask";
import { askResponse, readAskEvents, type AskEvent } from "./ask-stream";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

/** A model that answers with these pieces, or fails. */
const answers = (...pieces: string[]) =>
  new MockLanguageModelV4({
    modelId: "test/ask",
    doStream: async () => {
      if (pieces.length === 0) throw new Error("provider down");
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            ...pieces.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
            { type: "text-end", id: "t" },
            { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
          ],
        }),
      };
    },
  });

async function setup() {
  const db = await testDb();
  const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
  const user = async (netId: string, isStaff: boolean): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $3) returning id",
      [inst, netId, `Name ${netId}`],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff, isAdmin: false };
  };
  const prof = await user("prof", true);
  const other = await user("other", true);
  const [{ id: course }] = await db.query<{ id: string }>(
    "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
    [inst, prof.userId],
  );
  await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [course, prof.userId]);
  const [{ id: activity }] = await db.query<{ id: string }>(
    "insert into activities (course_id, tool, title, settings, status, points, created_by) values ($1, 'study-chat', 'Harbor Bikes', '{}', 'published', 10, $2) returning id",
    [course, prof.userId],
  );
  const chat = async (netId: string, message: string) => {
    const s = await user(netId, false);
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'student')", [course, s.userId]);
    const [{ id }] = await db.query<{ id: string }>(
      "insert into attempts (activity_id, user_id, status, ended_by, completed_at) values ($1, $2, 'completed', 'student', now()) returning id",
      [activity, s.userId],
    );
    await db.query("insert into chat_turns (attempt_id, client_key, message, reply, status, replied_at) values ($1, gen_random_uuid(), $2, 'Why?', 'done', now())", [id, message]);
    return id;
  };
  return { db, prof, other, course, activity, chat };
}

async function events(response: Response): Promise<AskEvent[]> {
  const all: AskEvent[] = [];
  for await (const e of readAskEvents(response.body!)) all.push(e);
  return all;
}

describe("askAboutClass", () => {
  it("answers from the class's conversations without names, streaming, with the labels to link", async () => {
    const { db, prof, activity, chat } = await setup();
    const ana = await chat("ana", "It's a bike shop.");
    const model = answers("Reteach the ", "shop idea [S1].");
    const started = await askAboutClass(db, model, prof, activity, " What should I reteach? ", [{ question: "Hi", answer: "Ready" }]);
    expect(started.kind).toBe("answering");
    if (started.kind !== "answering") return;
    expect(started.labels).toEqual({ S1: ana });
    const { response, settled } = askResponse(started, "failed");
    expect(await events(response)).toEqual([
      { type: "labels", labels: { S1: ana } },
      { type: "text", text: "Reteach the " },
      { type: "text", text: "shop idea [S1]." },
      { type: "done" },
    ]);
    await settled;
    const prompt = JSON.stringify(model.doStreamCalls[0].prompt);
    expect(prompt).toContain("It's a bike shop.");
    expect(prompt).toContain("What should I reteach?");
    expect(prompt).not.toContain("Name ana");
    expect(await db.query("select purpose, ok from ai_calls")).toEqual([{ purpose: ASK_PURPOSE, ok: true }]);
  });

  it("says when the AI fails, and refuses an empty question, someone else's class, nothing finished, and past the day's limit", async () => {
    const { db, prof, other, course, activity, chat } = await setup();
    expect(await askAboutClass(db, answers("x"), prof, activity, "  ", [])).toMatchObject({ reason: ASK_REFUSED.empty });
    expect(await askAboutClass(db, answers("x"), prof, activity, "Why?", [])).toMatchObject({ reason: ASK_REFUSED.nothing_finished });
    await chat("ana", "Hi");
    expect(await askAboutClass(db, answers("x"), other, activity, "Why?", [])).toMatchObject({ reason: ASK_REFUSED.not_found, status: 404 });

    const down = await askAboutClass(db, answers(), prof, activity, "Why?", []);
    if (down.kind !== "answering") throw new Error("expected an answer");
    const { response } = askResponse(down, "The AI didn't answer.");
    expect((await events(response)).at(-1)).toEqual({ type: "failed", reason: "The AI didn't answer." });

    for (let i = 0; i < ASKS_PER_DAY; i++) {
      await db.query("insert into ai_calls (purpose, model, user_id, course_id, ok) values ($1, 'm', $2, $3, true)", [ASK_PURPOSE, prof.userId, course]);
    }
    expect(await askAboutClass(db, answers("x"), prof, activity, "Why?", [])).toMatchObject({ reason: ASK_REFUSED.limit, status: 429 });
  });
});

describe("askPrompt", () => {
  it("starts the same way for every question, so the provider can cache the class", () => {
    const convo = [{ label: "S1", text: "Student: hi", grade: "Scored 3 of 4" }];
    const first = askPrompt("Case", [], convo, [], "Who struggled?");
    const second = askPrompt("Case", [], convo, [{ question: "Who struggled?", answer: "[S1]" }], "Why?");
    expect(second.system).toBe(first.system);
    expect(second.messages.slice(0, 2)).toEqual(first.messages.slice(0, 2));
    expect(second.messages.slice(2).map((m) => m.content)).toEqual(["Who struggled?", "[S1]", "Why?"]);
    expect(JSON.stringify(first.messages[0])).toContain("Grade: Scored 3 of 4");
  });

  it("sends back only the last few earlier questions", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` }));
    expect(askPrompt("Case", [], [], history, "Now?").messages).toHaveLength(2 + 12 + 1);
  });
});

describe("readHistory", () => {
  it("keeps only well-formed turns", () => {
    expect(readHistory([{ question: "Q", answer: "A" }, { question: " ", answer: "A" }, { question: 1 }, null])).toEqual([{ question: "Q", answer: "A" }]);
    expect(readHistory("nope")).toEqual([]);
  });
});
