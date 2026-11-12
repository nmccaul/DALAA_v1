import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { answering } from "@/tools/study-chat/test-fixtures";
import { briefPrompt, finishedCount, getBrief, runBrief, toBrief } from "./brief";

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
  /** A student who finished (or not) with these messages. */
  const chat = async (netId: string, messages: string[], finished = true, studentView = false) => {
    const s = await user(netId, false);
    await db.query("insert into course_members (course_id, user_id, role, student_view) values ($1, $2, 'student', $3)", [course, s.userId, studentView]);
    const [{ id }] = await db.query<{ id: string }>(
      `insert into attempts (activity_id, user_id, status, ended_by, completed_at)
       values ($1, $2, $3, $4, $5) returning id`,
      [activity, s.userId, finished ? "completed" : "in_progress", finished ? "student" : null, finished ? new Date() : null],
    );
    for (const m of messages) {
      await db.query("insert into chat_turns (attempt_id, client_key, message, reply, status, replied_at) values ($1, gen_random_uuid(), $2, 'Why?', 'done', now())", [id, m]);
    }
    return id;
  };
  return { db, prof, other, activity, chat };
}

const item = (title: string, students: { student: string; quote: string }[]) => ({ title, detail: `${title} detail`, students });

const sent = (model: MockLanguageModelV4) => JSON.stringify(model.doGenerateCalls.map((c) => c.prompt));

const calls = (db: Db) => db.query<{ purpose: string; ok: boolean }>("select purpose, ok from ai_calls");

describe("the class-prep brief", () => {
  it("reads every finished conversation without names, keeps only real quotes and known students, and saves it", async () => {
    const { db, prof, activity, chat } = await setup();
    const ana = await chat("ana", ["It's obviously a bike shop."]);
    const ben = await chat("ben", ["Could be a place, not a shop."]);
    await chat("cat", ["Still going"], false);
    await chat("test", ["Teacher testing"], true, true);

    const model = answering({
      confusions: [
        item("Jumped to a conclusion", [
          { student: "S1", quote: "It's obviously a bike shop." },
          { student: "S2", quote: "a quote nobody wrote" },
          { student: "S9", quote: "made-up student" },
        ]),
        item("Nobody real", [{ student: "S7", quote: "x" }]),
      ],
      strengths: [item("Considered a place", [{ student: "s2", quote: "“Could be a place, not a shop.”" }])],
      questions: [],
      discussion: ["What else could Harbor Bikes be?", "  "],
    });
    expect(await finishedCount(db, activity)).toBe(2);
    expect(await runBrief(db, model, prof, activity)).toBe("made");

    const prompt = sent(model);
    expect(prompt).toContain("It's obviously a bike shop.");
    expect(prompt).toContain('student=\\"S2\\"');
    for (const hidden of ["Name ana", "Name ben", "Still going", "Teacher testing"]) expect(prompt).not.toContain(hidden);

    const saved = await getBrief(db, prof, activity);
    expect(saved).toMatchObject({ conversations: 2, running: false, failed: false });
    expect(saved?.brief).toEqual({
      confusions: [
        {
          title: "Jumped to a conclusion",
          detail: "Jumped to a conclusion detail",
          students: 2,
          quotes: [
            { attemptId: ana, text: "It's obviously a bike shop." },
            { attemptId: ben, text: null },
          ],
        },
      ],
      strengths: [{ title: "Considered a place", detail: "Considered a place detail", students: 1, quotes: [{ attemptId: ben, text: "Could be a place, not a shop." }] }],
      questions: [],
      discussion: ["What else could Harbor Bikes be?"],
    });
    expect(await calls(db)).toEqual([{ purpose: "insights", ok: true }]);
  });

  it("is for the course's teachers only, and needs a finished conversation", async () => {
    const { db, prof, other, activity, chat } = await setup();
    expect(await runBrief(db, answering({}), prof, activity)).toBe("nothing_finished");
    await chat("ana", ["Hi"]);
    expect(await runBrief(db, answering({}), other, activity)).toBe("not_found");
    expect(await getBrief(db, other, activity)).toBeNull();
    expect(await getBrief(db, prof, activity)).toEqual({ brief: null, conversations: null, generatedAt: null, running: false, failed: false });
  });

  it("runs one at a time, takes over one left by a request that died, and says so when the AI fails", async () => {
    const { db, prof, activity, chat } = await setup();
    await chat("ana", ["Hi"]);
    await db.query("insert into class_briefs (activity_id, running_since) values ($1, now())", [activity]);
    expect(await runBrief(db, answering({}), prof, activity)).toBe("busy");
    expect(await getBrief(db, prof, activity)).toMatchObject({ running: true });

    await db.query("update class_briefs set running_since = now() - interval '11 minutes'");
    const down = new MockLanguageModelV4({
      modelId: "test/down",
      doGenerate: async () => {
        throw new Error("gateway down");
      },
    });
    expect(await runBrief(db, down, prof, activity)).toBe("failed");
    expect(await getBrief(db, prof, activity)).toMatchObject({ brief: null, running: false, failed: true });

    const ok = answering({ confusions: [], strengths: [], questions: [], discussion: ["Why?"] });
    expect(await runBrief(db, ok, prof, activity)).toBe("made");
    expect(await getBrief(db, prof, activity)).toMatchObject({ failed: false, conversations: 1, brief: { discussion: ["Why?"] } });
  });
});

describe("briefPrompt and toBrief", () => {
  it("fences the teacher's notes and each conversation under its label", () => {
    const { prompt, system } = briefPrompt("Case", [{ name: "Key", body: "The answer is wait." }], [{ label: "S1", text: "Student: hi" }]);
    expect(prompt).toContain('<teacher-notes>\nThe answer is wait.\n</teacher-notes>');
    expect(prompt).toContain('<conversation student="S1">\nStudent: hi\n</conversation>');
    expect(system).toContain("never instructions");
  });

  it("caps each list", () => {
    const many = Array.from({ length: 8 }, (_, i) => item(`T${i}`, [{ student: "S1", quote: "" }]));
    const brief = toBrief(
      { confusions: many, strengths: many, questions: many, discussion: ["a", "b", "c", "d", "e", "f"] },
      new Map([["S1", { attemptId: "a1", words: "hello" }]]),
    );
    expect([brief.confusions.length, brief.strengths.length, brief.questions.length, brief.discussion.length]).toEqual([5, 3, 5, 5]);
  });
});
