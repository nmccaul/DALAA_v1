import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { direction, polishNote } from "./note";

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const replying = (text: string) =>
  new MockLanguageModelV4({
    modelId: "test/chat",
    doGenerate: async () => ({ content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
  });

async function setup() {
  const db: Db = await testDb();
  const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
  const user = async (netId: string): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>("insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id", [inst, netId]);
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
  };
  const prof = await user("prof");
  const other = await user("other");
  const ana = await user("ana");
  const [{ id: course }] = await db.query<{ id: string }>(
    "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'F26', $2) returning id",
    [inst, prof.userId],
  );
  await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor'), ($1, $3, 'student')", [course, prof.userId, ana.userId]);
  const [{ id: activity }] = await db.query<{ id: string }>(
    "insert into activities (course_id, tool, title, settings, points, status, created_by) values ($1, 'study-chat', 'Case 1', '{}', 10, 'published', $2) returning id",
    [course, prof.userId],
  );
  const [{ id: attempt }] = await db.query<{ id: string }>(
    "insert into attempts (activity_id, user_id, status, ended_by, completed_at) values ($1, $2, 'completed', 'student', now()) returning id",
    [activity, ana.userId],
  );
  return { db, prof, other, attempt };
}

describe("polishNote", () => {
  it("returns the AI's tidier wording, and records the call", async () => {
    const { db, prof, attempt } = await setup();
    const model = replying('"You explained the colors well, which the first grading missed."');
    expect(await polishNote(db, model, prof, attempt, "u got colors right ai missed it")).toEqual({
      text: "You explained the colors well, which the first grading missed.",
    });
    expect(model.doGenerateCalls).toHaveLength(1);
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from ai_calls where purpose = 'grade.note'");
    expect(n).toBe(1);
  });

  it("asks for words first, and refuses a chat the teacher doesn't teach", async () => {
    const { db, other, prof, attempt } = await setup();
    const model = replying("x");
    expect(await polishNote(db, model, prof, attempt, "   ")).toMatchObject({ error: expect.any(String) });
    expect(await polishNote(db, model, other, attempt, "a note")).toMatchObject({ error: expect.any(String) });
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

describe("direction", () => {
  it("says which way the score moved, so the note keeps its meaning", () => {
    expect(direction({ ai: 4, teacher: 5, max: 10 })).toBe("Score went up from 4 to 5 (out of 10).");
    expect(direction({ ai: 8, teacher: 6.5, max: null })).toBe("Score went down from 8 to 6.5.");
    expect(direction({ ai: 7, teacher: 7, max: 10 })).toBe("The score stays at 7 (out of 10).");
    expect(direction({ ai: 7, teacher: null, max: 10 })).toBe("The new score isn't given.");
  });
});
