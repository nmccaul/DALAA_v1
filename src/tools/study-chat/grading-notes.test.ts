import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Db } from "@/db/types";
import { STUDY_CHAT } from "./create";
import { attemptLines, studyChatGradingNotes } from "./grading-notes";
import { draft } from "./test-fixtures";

const settings = draft({
  touchpoints: [
    { label: "Cash flow", description: "Notices the seasonal cash squeeze." },
    { label: "Lease terms", description: "Asks about the lease." },
  ],
});

describe("the Grading tab's class view of touchpoints", () => {
  let db: Db;
  let activity: string;
  let attempts: string[];

  /** Records that the live check saw `key` (and, with `position`, that position) for an attempt. */
  async function track(attemptId: string, keys: string[], position?: string) {
    const [{ id: turn }] = await db.query<{ id: string }>(
      `insert into chat_turns (attempt_id, client_key, message, reply, status, replied_at)
       values ($1, $2, 'Hi', 'Hello', 'done', now()) returning id`,
      [attemptId, randomUUID()],
    );
    for (const label of keys) {
      await db.query("insert into chat_touchpoints (attempt_id, key, label, turn_id) values ($1, lower($2), $2, $3)", [
        attemptId,
        label,
        turn,
      ]);
    }
    if (position) {
      await db.query("insert into chat_positions (attempt_id, key, label, turn_id) values ($1, lower($2), $2, $3)", [
        attemptId,
        position,
        turn,
      ]);
    }
  }

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const users = await db.query<{ id: string }>(
      `insert into users (institution_id, external_id, display_name)
       values ($1, 'prof', 'Prof'), ($1, 'a', 'A'), ($1, 'b', 'B'), ($1, 'c', 'C') returning id`,
      [inst],
    );
    const [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, users[0].id],
    );
    [{ id: activity }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, status, points, created_by)
       values ($1, $2, 'Second store', $3::text::jsonb, 'published', 10, $4) returning id`,
      [course, STUDY_CHAT, JSON.stringify(settings), users[0].id],
    );
    attempts = [];
    for (const u of users.slice(1)) {
      const [{ id }] = await db.query<{ id: string }>(
        "insert into attempts (activity_id, user_id, settings) values ($1, $2, $3::text::jsonb) returning id",
        [activity, u.id, JSON.stringify(settings)],
      );
      attempts.push(id);
    }
  });

  it("counts each touchpoint and position out of the students who started, listing ones nobody covered", async () => {
    await track(attempts[0], ["Cash flow", "Lease terms"], "Wait");
    await track(attempts[1], ["Cash flow"], "Wait");
    const notes = await studyChatGradingNotes(db, activity, attempts);
    expect(notes?.summary).toEqual([
      { heading: "Points covered", lines: ["Cash flow: 2 of 3 students", "Lease terms: 1 of 3 students"] },
      { heading: "Positions taken", lines: ["Open it: 0 of 3 students", "Wait: 2 of 3 students"] },
    ]);
    expect(notes?.byAttempt).toEqual({
      [attempts[0]]: ["Points covered — 2 of 2: Cash flow, Lease terms", "Position: Wait"],
      [attempts[1]]: ["Points covered — 1 of 2: Cash flow", "Position: Wait"],
      [attempts[2]]: ["Points covered — 0 of 2", "Position: none yet"],
    });
  });

  it("counts only the attempts it's given, and none from another activity", async () => {
    await track(attempts[0], ["Cash flow"]);
    await track(attempts[1], ["Cash flow"]);
    const notes = await studyChatGradingNotes(db, activity, [attempts[0], randomUUID()]);
    expect(notes?.summary[0].lines).toEqual(["Cash flow: 1 of 1 student", "Lease terms: 0 of 1 student"]);
    expect(Object.keys(notes!.byAttempt)).toEqual([attempts[0]]);
  });

  it("keeps a touchpoint an attempt covered under older settings, by its old name", async () => {
    await track(attempts[0], ["Cash flow"]);
    const renamed = { ...settings, touchpoints: [{ label: "Seasonality", description: "Cash squeeze." }] };
    await db.query("update activities set settings = $2::text::jsonb where id = $1", [activity, JSON.stringify(renamed)]);
    const notes = await studyChatGradingNotes(db, activity, attempts);
    expect(notes?.summary[0].lines).toEqual(["Seasonality: 0 of 3 students", "Cash flow: 1 of 3 students"]);
  });

  it("shows no class view before anyone starts, and nothing for a chat with no touchpoints or positions", async () => {
    expect(await studyChatGradingNotes(db, activity, [])).toEqual({ summary: [], byAttempt: {} });
    const bare = { ...settings, touchpoints: [], positions: [] };
    await db.query("update activities set settings = $2::text::jsonb where id = $1", [activity, JSON.stringify(bare)]);
    expect(await studyChatGradingNotes(db, activity, attempts)).toBeNull();
  });

  it("names what each student's line counts", () => {
    expect(attemptLines({ touchpoints: [], position: null, total: 0 }, false)).toEqual([]);
    expect(attemptLines({ touchpoints: [{ key: "c", label: "Cost" }], position: null, total: 3 }, false)).toEqual([
      "Points covered — 1 of 3: Cost",
    ]);
  });
});
