import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { activityMaterials } from "@/activities/materials";
import { getTaughtActivity } from "@/activities/store";
import { saveGuide } from "@/content/guide";
import { saveContent } from "@/content/store";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { findTool, isLive } from "@/tools/catalog";
import { createStudyChat, publishStudyChat, saveStudyChat, STUDY_CHAT } from "./create";
import { answering, draft, drafted } from "./test-fixtures";

describe("creating a Study Chat", () => {
  let db: Db;
  let prof: Actor;
  let other: Actor;
  let course: string;
  let content: string;

  const actor = async (inst: string, netId: string): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
  };

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    prof = await actor(inst, "prof");
    other = await actor(inst, "other");
    [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, prof.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [course, prof.userId]);
    const saved = await saveContent(db, prof, course, randomUUID(), {
      kind: "paste",
      name: "Case: Harbor Bikes",
      text: "Harbor Bikes sells 1,200 bikes a year.",
    });
    if (!saved.ok) throw new Error(saved.reason);
    content = saved.content.id;
  });

  it("is the live tool in the catalog", () => {
    const tool = findTool(STUDY_CHAT);
    expect(tool && isLive(tool)).toBe(true);
  });

  it("saves the AI's draft as a draft, titled and pointed from it", async () => {
    const model = answering(drafted());
    const result = await createStudyChat(db, model, prof, course, { contentId: content, guideId: null, studentWork: false, mode: "case-chat", creationKey: randomUUID() });
    if (!result.ok) throw new Error(result.reason);

    expect(await getTaughtActivity(db, prof, result.activityId)).toEqual({
      id: result.activityId,
      courseId: course,
      tool: "study-chat",
      title: "Second store",
      status: "draft",
      points: 10,
      settings: draft(),
      contentId: content,
      guideId: null,
    });
    expect(await getTaughtActivity(db, other, result.activityId)).toBeNull();
  });

  it("returns the first activity on a retry and doesn't draft again", async () => {
    const model = answering(drafted());
    const request = { contentId: content, guideId: null, studentWork: false, mode: "case-chat" as const, creationKey: randomUUID() };
    const first = await createStudyChat(db, model, prof, course, request);
    const again = await createStudyChat(db, model, prof, course, request);
    expect(again).toEqual(first);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(await db.query("select id from activities")).toHaveLength(1);
  });

  it("saves nothing when the draft fails, and refuses material from someone else's course", async () => {
    const failed = await createStudyChat(db, answering("not json"), prof, course, {
      contentId: content,
      guideId: null,
      studentWork: false,
      mode: "case-chat",
      creationKey: randomUUID(),
    });
    expect(failed).toEqual({ ok: false, reason: "The AI couldn't draft this chat. Try again in a minute." });

    const model = answering(drafted());
    const notTheirs = await createStudyChat(db, model, other, course, { contentId: content, guideId: null, studentWork: false, mode: "case-chat", creationKey: randomUUID() });
    expect(notTheirs.ok).toBe(false);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await db.query("select id from activities")).toEqual([]);
  });

  it("attaches its reading and AI-only notes for every model that reads them", async () => {
    const guide = await saveGuide(db, prof, course, randomUUID(), { kind: "paste", name: "Teaching note", text: "Key." });
    if (!guide.ok) throw new Error(guide.reason);
    const result = await createStudyChat(db, answering(drafted()), prof, course, {
      contentId: content,
      guideId: guide.content.id,
      studentWork: false,
      mode: "case-chat",
      creationKey: randomUUID(),
    });
    if (!result.ok) throw new Error(result.reason);
    const { readings, guides } = await activityMaterials(db, result.activityId);
    expect(readings.map((r) => r.id)).toEqual([content]);
    expect(guides.map((g) => g.id)).toEqual([guide.content.id]);
  });

  it("refuses materials longer than the limit together, before asking the AI", async () => {
    const long = await saveContent(db, prof, course, randomUUID(), { kind: "paste", name: "Long case", text: "a".repeat(90_000) });
    const guide = await saveGuide(db, prof, course, randomUUID(), { kind: "paste", name: "Long note", text: "b".repeat(70_000) });
    if (!long.ok || !guide.ok) throw new Error("setup");
    const model = answering(drafted());
    const result = await createStudyChat(db, model, prof, course, {
      contentId: long.content.id,
      guideId: guide.content.id,
      studentWork: false,
      mode: "case-chat",
      creationKey: randomUUID(),
    });
    expect(result).toEqual({
      ok: false,
      reason: "Together these materials are 160,000 characters; the limit is 150,000. Leave one out or use a shorter excerpt.",
    });
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("keeps the teacher's 'Students bring their own work' switch, whatever the draft says", async () => {
    const model = answering(drafted({ studentWork: false }));
    const request = { contentId: content, guideId: null, mode: "case-chat" as const, studentWork: true, creationKey: randomUUID() };
    const result = await createStudyChat(db, model, prof, course, request);
    if (!result.ok) throw new Error(result.reason);
    expect((await getTaughtActivity(db, prof, result.activityId))?.settings).toMatchObject({ studentWork: true });
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain("Each student adds their own work");
  });

  it("keeps the teacher's 'Show students their progress' switch, off unless they turned it on", async () => {
    const saved = async (showProgress: boolean | undefined) => {
      const request = { contentId: content, guideId: null, mode: "case-chat" as const, studentWork: false, showProgress, creationKey: randomUUID() };
      const result = await createStudyChat(db, answering(drafted({ showProgress: !showProgress })), prof, course, request);
      if (!result.ok) throw new Error(result.reason);
      return (await getTaughtActivity(db, prof, result.activityId))?.settings;
    };
    expect(await saved(true)).toMatchObject({ showProgress: true });
    expect(await saved(false)).toMatchObject({ showProgress: false });
    expect(await saved(undefined)).toMatchObject({ showProgress: false });
  });

  it("turns on 'Students bring their own work' for a Defend chat even when the switch was left off", async () => {
    const model = answering(drafted({ studentWork: false }));
    const request = { contentId: content, guideId: null, mode: "defend" as const, studentWork: false, creationKey: randomUUID() };
    const result = await createStudyChat(db, model, prof, course, request);
    if (!result.ok) throw new Error(result.reason);
    expect((await getTaughtActivity(db, prof, result.activityId))?.settings).toMatchObject({ mode: "defend", studentWork: true });
  });

  it("publishes for the course's teacher only, and only settings that fit the schema", async () => {
    const result = await createStudyChat(db, answering(drafted()), prof, course, {
      contentId: content,
      guideId: null,
      studentWork: false,
      mode: "case-chat",
      creationKey: randomUUID(),
    });
    if (!result.ok) throw new Error(result.reason);

    expect(await publishStudyChat(db, other, result.activityId)).toEqual({ ok: false, reason: "That assignment isn't one of yours." });
    await db.query("update activities set settings = settings - 'goal' where id = $1", [result.activityId]);
    expect(await publishStudyChat(db, prof, result.activityId)).toEqual({
      ok: false,
      reason: "Some settings need fixing before you publish.",
    });

    await db.query("update activities set settings = $2 where id = $1", [result.activityId, JSON.stringify(draft())]);
    expect(await publishStudyChat(db, prof, result.activityId)).toEqual({ ok: true });
    expect(await publishStudyChat(db, prof, result.activityId)).toEqual({ ok: true });
    expect((await getTaughtActivity(db, prof, result.activityId))?.status).toBe("published");
  });

  it("saves a teacher's edits, with the title and points following the settings", async () => {
    const result = await createStudyChat(db, answering(drafted()), prof, course, {
      contentId: content,
      guideId: null,
      studentWork: false,
      mode: "case-chat",
      creationKey: randomUUID(),
    });
    if (!result.ok) throw new Error(result.reason);
    const edited = draft();
    edited.scenarios[0].title = "Two stores?";
    edited.completion.timeLimitMinutes = 20;
    edited.rubric.criteria.push({ label: "Clarity", description: "Says it plainly.", points: 5 });

    expect(await saveStudyChat(db, other, result.activityId, edited)).toEqual({ ok: false, reason: "That assignment isn't one of yours." });
    expect(await saveStudyChat(db, prof, result.activityId, edited)).toEqual({ ok: true });
    expect(await saveStudyChat(db, prof, result.activityId, edited)).toEqual({ ok: true });
    expect(await getTaughtActivity(db, prof, result.activityId)).toMatchObject({
      title: "Two stores?",
      points: 15,
      settings: edited,
      status: "draft",
    });
    expect(await publishStudyChat(db, prof, result.activityId)).toEqual({ ok: true });
  });

  it("refuses edits that don't fit the schema and keeps what was saved", async () => {
    const result = await createStudyChat(db, answering(drafted()), prof, course, {
      contentId: content,
      guideId: null,
      studentWork: false,
      mode: "case-chat",
      creationKey: randomUUID(),
    });
    if (!result.ok) throw new Error(result.reason);

    expect(await saveStudyChat(db, prof, result.activityId, { ...draft(), goal: "", secret: true })).toEqual({
      ok: false,
      reason: "Some settings need fixing before you save.",
      problems: ["“Goal” can't be empty.", "“Study Chat settings” needs a valid value."],
    });
    expect((await getTaughtActivity(db, prof, result.activityId))?.settings).toEqual(draft());
  });
});
