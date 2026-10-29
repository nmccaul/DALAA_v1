import { randomUUID } from "node:crypto";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it } from "vitest";
import { saveGuide } from "@/content/guide";
import { saveContent } from "@/content/store";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { STUDY_CHAT } from "./create";
import type { StudyChatSettings } from "./schema";
import { answering, draft } from "./test-fixtures";
import { runTrial, trialEnding, TRIAL_BUSY, TRIAL_FAILED, TRIAL_MAX_TURNS, type TrialModels } from "./trial";

const GUIDE = "ANSWER KEY: the winter cash squeeze sinks a second store.";
const READING = "Harbor Bikes sells bikes in a beach town.";

const grade = {
  criteria: [
    { criterion: "Questions", score: 2, evidence: "", feedback: "Asked a little." },
    { criterion: "Recommendation", score: 3, evidence: "", feedback: "Some evidence." },
  ],
  touchpoints: [{ touchpoint: "Cash flow", hit: true, evidence: "" }],
  position: "Wait",
  feedback: "A fair start.",
};

const notYet = { answered: false, awaitingStudent: false };
const answered = { answered: true, awaitingStudent: false };

/** Mock models: the sample student and the chat each say one line; `check` answers in turn. */
const models = (...checks: unknown[]): TrialModels => ({
  student: answering("I'd wait until cash flow is steadier."),
  reply: answering("Why do you say that?"),
  check: answering(...(checks.length > 0 ? checks : [notYet])),
  grader: answering(grade),
});

/** Every prompt a mock model was sent, as one string. */
const sent = (model: TrialModels[keyof TrialModels]) => JSON.stringify((model as MockLanguageModelV4).doGenerateCalls.map((c) => c.prompt));

describe("trying a Study Chat with a sample student", () => {
  let db: Db;
  let prof: Actor;
  let student: Actor;
  let course: string;

  const actor = async (inst: string, netId: string, isStaff: boolean): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff, isAdmin: false };
  };

  const activity = async (settings: StudyChatSettings) => {
    const content = await saveContent(db, prof, course, randomUUID(), { kind: "paste", name: "Case", text: READING });
    const guide = await saveGuide(db, prof, course, randomUUID(), { kind: "paste", name: "Teaching note", text: GUIDE });
    if (!content.ok || !guide.ok) throw new Error("setup");
    const [{ id }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, content_id, guide_id, created_by)
       values ($1, $2, 'Second store', $3::text::jsonb, $4, $5, $6) returning id`,
      [course, STUDY_CHAT, JSON.stringify(settings), content.content.id, guide.content.id, prof.userId],
    );
    return id;
  };

  const completion = (over: Partial<StudyChatSettings["completion"]>) => ({ ...draft().completion, ...over });

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    prof = await actor(inst, "prof", true);
    student = await actor(inst, "student", false);
    [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, prof.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [course, prof.userId]);
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'student')", [course, student.userId]);
  });

  it("runs until the question is answered, grades it, and saves no attempt or result", async () => {
    const id = await activity(draft({ completion: completion({ question: "Should Maya open it?" }) }));
    const outcome = await runTrial(db, models(notYet, answered), prof, id, "struggling");

    expect(outcome).toMatchObject({ ok: true, trial: { endedBy: "question", work: null } });
    if (!outcome.ok) return;
    expect(outcome.trial.opening).toBe(draft().scenarios[0].opening);
    expect(outcome.trial.turns).toEqual([
      { message: "I'd wait until cash flow is steadier.", reply: "Why do you say that?" },
      { message: "I'd wait until cash flow is steadier.", reply: "Why do you say that?" },
    ]);
    expect(outcome.trial.grade).toMatchObject({ position: "Wait", feedback: "A fair start." });
    expect(outcome.trial.grade?.criteria.map((c) => c.score)).toEqual([2, 3]);

    for (const table of ["attempts", "chat_turns", "results", "sample_trials"]) {
      expect(await db.query(`select 1 from ${table}`), table).toEqual([]);
    }
    const calls = await db.query<{ purpose: string; course_id: string; user_id: string }>("select purpose, course_id, user_id from ai_calls");
    // Two student lines, two replies, two checks, one grading.
    expect(calls).toHaveLength(7);
    expect(new Set(calls.map((c) => `${c.purpose} ${c.course_id} ${c.user_id}`))).toEqual(new Set([`trial ${course} ${prof.userId}`]));
  });

  it("stops at the chat's turn limit, or at the trial's cap when the chat has none", async () => {
    const limited = await runTrial(db, models(), prof, await activity(draft({ completion: completion({ maxTurns: 3 }) })), "strong");
    expect(limited).toMatchObject({ ok: true, trial: { endedBy: "turns" } });
    expect(limited.ok && limited.trial.turns).toHaveLength(3);

    const open = await runTrial(db, models(), prof, await activity(draft({ completion: completion({ maxTurns: null }) })), "strong");
    expect(open).toMatchObject({ ok: true, trial: { endedBy: "cap" } });
    expect(open.ok && open.trial.turns).toHaveLength(TRIAL_MAX_TURNS);
  });

  it("never gives the sample student the guide, the situation, the rubric, touchpoints or positions", async () => {
    const m = models(answered);
    await runTrial(db, m, prof, await activity(draft({ completion: completion({ question: "Should Maya open it?" }) })), "struggling");
    const seen = sent(m.student);
    expect(seen).toContain(READING);
    expect(seen).toContain("Should Maya open it?");
    expect(seen).toContain("struggling student");
    for (const hidden of [GUIDE, draft().scenarios[0].situation, "Asks questions that uncover", "seasonal cash squeeze", "Fix cash flow first"]) {
      expect(seen).not.toContain(hidden);
    }
    // The chat model and the grader do get the guide, as for a real student.
    expect(sent(m.reply)).toContain(GUIDE);
    expect(sent(m.grader)).toContain(GUIDE);
  });

  it("has the sample student bring work when the chat asks for it", async () => {
    const m = models();
    const outcome = await runTrial(db, m, prof, await activity(draft({ studentWork: true, completion: completion({ maxTurns: 1 }) })), "strong");
    expect(outcome).toMatchObject({ ok: true, trial: { work: { name: "Sample student's work" } } });
    expect(sent(m.reply)).toContain('role=\\"student-work\\"');
    expect(await db.query("select 1 from attempt_work")).toEqual([]);
  });

  it("runs one trial at a time per teacher, and takes over a trial left by a request that died", async () => {
    const id = await activity(draft({ completion: completion({ maxTurns: 1 }) }));
    await db.query("insert into sample_trials (user_id) values ($1)", [prof.userId]);
    expect(await runTrial(db, models(), prof, id, "strong")).toEqual({ ok: false, reason: TRIAL_BUSY });
    expect(await db.query("select 1 from ai_calls")).toEqual([]);

    await db.query("update sample_trials set started_at = now() - interval '11 minutes'");
    expect(await runTrial(db, models(), prof, id, "strong")).toMatchObject({ ok: true });
    expect(await db.query("select 1 from sample_trials")).toEqual([]);
  });

  it("says so plainly when the AI fails, and frees the slot", async () => {
    const failing = new MockLanguageModelV4({
      modelId: "test/down",
      doGenerate: async () => {
        throw new Error("gateway down");
      },
    });
    const id = await activity(draft());
    expect(await runTrial(db, { ...models(), reply: failing }, prof, id, "strong")).toEqual({ ok: false, reason: TRIAL_FAILED });
    expect(await db.query("select 1 from sample_trials")).toEqual([]);
    expect(await db.query("select 1 from chat_turns")).toEqual([]);
  });

  it("is for the course's teachers only", async () => {
    const id = await activity(draft());
    expect(await runTrial(db, models(), student, id, "strong")).toEqual({ ok: false, reason: "We couldn't find that activity." });
    expect(await db.query("select 1 from sample_trials")).toEqual([]);
  });
});

describe("trialEnding", () => {
  const turns = (n: number) => Array.from({ length: n }, () => ({ message: "m", reply: "r" }));
  it("says how many messages the sample student sent and why it stopped", () => {
    expect(trialEnding({ endedBy: "turns", turns: turns(6) })).toBe(
      "Ended after 6 messages from the sample student: it reached the chat's message limit.",
    );
    expect(trialEnding({ endedBy: "question", turns: turns(1) })).toBe(
      "Ended after 1 message from the sample student: they answered the chat's question.",
    );
    expect(trialEnding({ endedBy: "cap", turns: turns(TRIAL_MAX_TURNS) })).toBe(
      `Ended after ${TRIAL_MAX_TURNS} messages from the sample student: a sample student stops at ${TRIAL_MAX_TURNS}.`,
    );
  });
});
