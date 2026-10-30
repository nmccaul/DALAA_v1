import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { claimGrading, getResult, saveGrade } from "@/results/store";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { STUDY_CHAT } from "./create";
import { gradeAttempt, gradeIfEnded, gradePrompt, toResult } from "./grade";
import { answering, draft } from "./test-fixtures";

const TURNS = [
  { message: "How is cash flow in the winter?", reply: "Tight. We lose money from November to February." },
  { message: "Then I'd wait: fix the seasonal cash squeeze before a second lease.", reply: "Fair point." },
];

/** A grader answer that fits `draft()`: two criteria, one touchpoint, two positions. */
const answer = (over: Record<string, unknown> = {}) => ({
  criteria: [
    { criterion: "Questions", score: 3, evidence: "How is cash flow in the winter?", feedback: "Good question about cash." },
    { criterion: "Recommendation", score: 5.5, evidence: "“fix the seasonal cash squeeze”", feedback: "Clear, backed by the case." },
  ],
  touchpoints: [{ touchpoint: "Cash flow", hit: true, evidence: "fix the seasonal cash squeeze before a second lease" }],
  position: "wait",
  feedback: "You found the cash problem and used it.",
  ...over,
});

describe("grading a Study Chat", () => {
  let db: Db;
  let activity: string;
  let attempt: string;
  let student: Actor;

  const grades = () => db.query("select id from ai_calls where purpose = 'grade'");

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const [{ id: prof }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'prof', 'Prof') returning id",
      [inst],
    );
    const [{ id: studentId }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, 'student', 'Student') returning id",
      [inst],
    );
    student = { userId: studentId, institutionId: inst, netId: "student", displayName: "Student", isStaff: false, isAdmin: false };
    const [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, prof],
    );
    [{ id: activity }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, status, points, created_by)
       values ($1, $2, 'Second store', $3::text::jsonb, 'published', 10, $4) returning id`,
      [course, STUDY_CHAT, JSON.stringify(draft()), prof],
    );
    [{ id: attempt }] = await db.query<{ id: string }>(
      `insert into attempts (activity_id, user_id, status, ended_by, completed_at)
       values ($1, $2, 'completed', 'student', now()) returning id`,
      [activity, studentId],
    );
    for (const [i, t] of TURNS.entries()) {
      await db.query(
        `insert into chat_turns (attempt_id, client_key, message, reply, status, sent_at, replied_at)
         values ($1, $2, $3, $4, 'done', now() + make_interval(secs => $5), now())`,
        [attempt, randomUUID(), t.message, t.reply, i],
      );
    }
  });

  it("asks with the rubric, strictness, touchpoints, positions and the whole transcript", () => {
    const { system, prompt } = gradePrompt(draft(), TURNS, null, null, null);
    expect(system).toContain("Be fair.");
    expect(prompt).toContain("Recommendation (6 points): Makes a recommendation backed by evidence.");
    expect(prompt).toContain("Cash flow: Notices the seasonal cash squeeze.");
    expect(prompt).toContain("Wait: Fix cash flow first.");
    expect(prompt).toContain("AI: Thanks for coming in.");
    expect(prompt).toContain("Student: Then I'd wait");
    expect(gradePrompt(draft({ rubric: { ...draft().rubric, strictness: "strict" } }), TURNS, null, null, null).system).toContain("Be strict.");
  });

  it("gives the grader what the live check tracked as evidence, to check against the transcript", () => {
    const tracked = { touchpoints: [{ key: "cash flow", label: "Cash flow" }], position: { key: "wait", label: "Wait" } };
    const { prompt } = gradePrompt(draft(), TURNS, null, null, tracked);
    expect(prompt).toContain("It can be wrong: judge touchpoints and the position from the transcript.");
    expect(prompt).toContain("- Touchpoints it thought the student brought up: Cash flow");
    expect(prompt).toContain("- Position it thought the student took: Wait");
    const none = gradePrompt(draft(), TURNS, null, null, { touchpoints: [], position: null }).prompt;
    expect(none).toContain("brought up: none");
    expect(none).toContain("took: none");
    expect(gradePrompt(draft(), TURNS, null, null, null).prompt).not.toContain("quick check");
    expect(gradePrompt(draft({ touchpoints: [], positions: [] }), TURNS, null, null, tracked).prompt).not.toContain("quick check");
  });

  it("reads the attempt's tracked progress into the grader's prompt", async () => {
    const [{ id: turn }] = await db.query<{ id: string }>("select id from chat_turns where attempt_id = $1 limit 1", [attempt]);
    await db.query("insert into chat_touchpoints (attempt_id, key, label, turn_id) values ($1, 'cash flow', 'Cash flow', $2)", [attempt, turn]);
    const grader = answering(answer());
    await gradeAttempt(db, grader, attempt);
    const sent = JSON.stringify(grader.doGenerateCalls[0].prompt);
    expect(sent).toContain("brought up: Cash flow");
    expect(sent).toContain("took: none");
  });

  it("stores the result in the shared shape, totalled, with the student's own quotes", async () => {
    const result = await gradeAttempt(db, answering(answer()), attempt);
    expect(result).toMatchObject({
      status: "graded",
      score: 8.5,
      maxScore: 10,
      criteria: [
        { label: "Questions", score: 3, max: 4, evidence: "How is cash flow in the winter?" },
        { label: "Recommendation", score: 5.5, max: 6, evidence: "fix the seasonal cash squeeze" },
      ],
      touchpoints: [{ label: "Cash flow", hit: true }],
      position: "Wait",
      feedback: "You found the cash problem and used it.",
    });
    expect(await grades()).toHaveLength(1);
  });

  it("grades under the settings the attempt started with, not the teacher's later edits (D-031)", async () => {
    await db.query("update attempts set settings = $2::text::jsonb where id = $1", [attempt, JSON.stringify(draft())]);
    const edited = draft({
      touchpoints: [],
      rubric: { criteria: [{ label: "Only", description: "Anything.", points: 5 }], strictness: "strict" },
    });
    await db.query("update activities set settings = $2::text::jsonb where id = $1", [activity, JSON.stringify(edited)]);

    const grader = answering(answer());
    expect(await gradeAttempt(db, grader, attempt)).toMatchObject({
      status: "graded",
      maxScore: 10,
      criteria: [{ label: "Questions", max: 4 }, { label: "Recommendation", max: 6 }],
      touchpoints: [{ label: "Cash flow" }],
    });
    expect(JSON.stringify(grader.doGenerateCalls[0].prompt)).toContain("Be fair.");
  });

  it("grades an attempt from before settings were copied under the activity's current settings", async () => {
    const edited = draft({ rubric: { ...draft().rubric, strictness: "strict" } });
    await db.query("update activities set settings = $2::text::jsonb where id = $1", [activity, JSON.stringify(edited)]);
    const grader = answering(answer());
    expect(await gradeAttempt(db, grader, attempt)).toMatchObject({ status: "graded" });
    expect(JSON.stringify(grader.doGenerateCalls[0].prompt)).toContain("Be strict.");
  });

  it("keeps a quote without the quote marks the grader wrapped it in", () => {
    const result = toResult(
      draft(),
      answer({
        criteria: [
          { criterion: "Questions", score: 4, evidence: '"How is cash flow in the winter?"', feedback: "Good." },
          { criterion: "Recommendation", score: 5, evidence: "‘fix the seasonal cash squeeze’", feedback: "Clear." },
        ],
      }),
      TURNS,
    );
    expect(result.criteria.map((c) => c.evidence)).toEqual(["How is cash flow in the winter?", "fix the seasonal cash squeeze"]);
  });

  it("drops a quote the student didn't write and a position the chat doesn't have", () => {
    const result = toResult(
      draft(),
      answer({
        criteria: [
          { criterion: "Questions", score: 4, evidence: "Tight. We lose money", feedback: "Quoted the AI." },
          { criterion: "Recommendation", score: 0, evidence: "", feedback: "None given." },
        ],
        position: "Sell the shop",
      }),
      TURNS,
    );
    expect(result.criteria.map((c) => c.evidence)).toEqual([null, null]);
    expect(result.position).toBeNull();
  });

  it("asks again when an answer doesn't fit the rubric, then gives up as failed and can be graded later", async () => {
    const tooHigh = answer({ criteria: [answer().criteria[0], { ...answer().criteria[1], score: 7 }] });
    expect(await gradeAttempt(db, answering(tooHigh, answer()), attempt)).toMatchObject({ status: "graded", score: 8.5 });

    await db.query("delete from results");
    const missing = answer({ criteria: [answer().criteria[0]] });
    expect(await gradeAttempt(db, answering(missing), attempt)).toEqual({ status: "failed" });
    expect(await grades()).toHaveLength(4);

    expect(await gradeAttempt(db, answering(answer()), attempt)).toMatchObject({ status: "graded", score: 8.5 });
  });

  it("grades once: a second call returns the first grade without asking again", async () => {
    await gradeAttempt(db, answering(answer()), attempt);
    const again = answering(answer({ feedback: "Different." }));
    expect(await gradeAttempt(db, again, attempt)).toMatchObject({ feedback: "You found the cash problem and used it." });
    expect(again.doGenerateCalls).toHaveLength(0);
  });

  it("leaves an attempt alone while another request is grading it, and takes over a stuck one", async () => {
    expect(await claimGrading(db, attempt)).toBe(true);
    const model = answering(answer());
    expect(await gradeAttempt(db, model, attempt)).toEqual({ status: "grading" });
    expect(model.doGenerateCalls).toHaveLength(0);

    await db.query("update results set started_at = now() - interval '10 minutes'");
    expect(await gradeAttempt(db, model, attempt)).toMatchObject({ status: "graded" });
  });

  it("doesn't grade a chat that's still going, and a score is NULL until graded", async () => {
    await db.query("update attempts set status = 'in_progress', ended_by = null, completed_at = null");
    expect(await gradeAttempt(db, answering(answer()), attempt)).toBeNull();
    expect(await claimGrading(db, attempt)).toBe(false);
    expect(await getResult(db, attempt)).toBeNull();

    await db.query("update attempts set status = 'completed', ended_by = 'time', completed_at = now()");
    await claimGrading(db, attempt);
    const [row] = await db.query<{ score: unknown }>("select score from results");
    expect(row.score).toBeNull();
  });

  it("grades the student's chat once it has ended, and not before", async () => {
    await db.query("update attempts set status = 'in_progress', ended_by = null, completed_at = null");
    const model = answering(answer());
    await gradeIfEnded(db, model, student, activity);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await getResult(db, attempt)).toBeNull();

    await db.query("update attempts set status = 'completed', ended_by = 'question', completed_at = now()");
    await gradeIfEnded(db, model, student, activity);
    expect(await getResult(db, attempt)).toMatchObject({ status: "graded", score: 8.5 });

    const other = { ...student, userId: randomUUID() };
    await expect(gradeIfEnded(db, answering(answer()), other, activity)).resolves.toBeUndefined();
  });

  it("gives 0 without a model call when no message got a reply", async () => {
    await db.query("delete from chat_turns");
    const model = answering(answer());
    expect(await gradeAttempt(db, model, attempt)).toMatchObject({ status: "graded", score: 0, maxScore: 10 });
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("refuses to store a criterion scored above its points", async () => {
    await claimGrading(db, attempt);
    const result = toResult(draft(), answer(), TURNS);
    await expect(saveGrade(db, attempt, { ...result, criteria: [{ ...result.criteria[0], score: 5 }] })).rejects.toThrow();
  });
});
