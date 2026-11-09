import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { copyActivity } from "./copy";
import { activityMaterials, setActivityMaterials } from "./materials";
import { getTaughtActivity } from "./store";

describe("copyActivity", () => {
  let db: Db;
  let inst: string;
  let prof: Actor;
  let other: Actor;
  let course: string;
  let nextTerm: string;
  let activity: string;
  let reading: string;
  let note: string;

  const actor = async (netId: string): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
  };
  const newCourse = async (owner: Actor, term: string) => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', $2, $3) returning id",
      [inst, term, owner.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [id, owner.userId]);
    return id;
  };
  const material = async (table: "course_content" | "course_guides", courseId: string, name: string) => {
    const [{ id }] = await db.query<{ id: string }>(
      `insert into ${table} (course_id, source, name, body, creation_key, created_by)
       values ($1, 'paste', $2, $3, $4, $5) returning id`,
      [courseId, name, `${name} body`, randomUUID(), prof.userId],
    );
    return id;
  };
  const count = async (table: string, courseId: string) =>
    (await db.query<{ n: number }>(`select count(*)::int as n from ${table} where course_id = $1`, [courseId]))[0].n;

  beforeEach(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    prof = await actor("prof");
    other = await actor("other");
    course = await newCourse(prof, "F26");
    nextTerm = await newCourse(prof, "W27");
    reading = await material("course_content", course, "Harbor Bikes case");
    note = await material("course_guides", course, "Teaching note");
    const [{ id }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, points, status, due_at,
                               lti_resource_link_id, lti_line_item_url, creation_key, created_by)
       values ($1, 'study-chat', 'Harbor Bikes', '{"goal":"Weigh the options"}', 10, 'published', now(),
               'link-1', 'https://canvas.test/line/1', $2, $3) returning id`,
      [course, randomUUID(), prof.userId],
    );
    activity = id;
    expect(await setActivityMaterials(db, prof, activity, { contentIds: [reading], guideIds: [note] })).toEqual({ ok: true });
    const student = await actor("student");
    await db.query("insert into attempts (activity_id, user_id) values ($1, $2)", [activity, student.userId]);
  });

  const copyRow = async (id: string) =>
    (
      await db.query<Record<string, unknown>>(
        `select course_id, tool, title, settings, points::float8 as points, status, due_at,
                lti_resource_link_id, lti_line_item_url
           from activities where id = $1`,
        [id],
      )
    )[0];

  it("copies within the course as a draft with the same materials", async () => {
    const copied = await copyActivity(db, prof, activity, course, randomUUID());
    if (!copied.ok) throw new Error(copied.reason);
    expect(copied.id).not.toBe(activity);
    expect(await copyRow(copied.id)).toEqual({
      course_id: course,
      tool: "study-chat",
      title: "Harbor Bikes",
      settings: { goal: "Weigh the options" },
      points: 10,
      status: "draft",
      due_at: null,
      lti_resource_link_id: null,
      lti_line_item_url: null,
    });
    const m = await activityMaterials(db, copied.id);
    expect(m.readings.map((r) => r.id)).toEqual([reading]);
    expect(m.guides.map((g) => g.id)).toEqual([note]);
    expect(await count("course_content", course)).toBe(1);
    expect(await count("course_guides", course)).toBe(1);
  });

  it("copies into another course with its materials copied there", async () => {
    const copied = await copyActivity(db, prof, activity, nextTerm, randomUUID());
    if (!copied.ok) throw new Error(copied.reason);
    expect((await getTaughtActivity(db, prof, copied.id))?.courseId).toBe(nextTerm);

    const m = await activityMaterials(db, copied.id);
    expect(m.readings.map((r) => [r.name, r.body])).toEqual([["Harbor Bikes case", "Harbor Bikes case body"]]);
    expect(m.guides.map((g) => [g.name, g.body])).toEqual([["Teaching note", "Teaching note body"]]);
    expect(m.readings[0].id).not.toBe(reading);
    expect(m.guides[0].id).not.toBe(note);
    // Still a reading and a note: the AI-only note didn't become something students read.
    expect(await count("course_content", nextTerm)).toBe(1);
    expect(await count("course_guides", nextTerm)).toBe(1);
  });

  it("reuses a material the other course already has instead of copying it twice", async () => {
    const first = await copyActivity(db, prof, activity, nextTerm, randomUUID());
    const second = await copyActivity(db, prof, activity, nextTerm, randomUUID());
    if (!first.ok || !second.ok) throw new Error("copy failed");
    expect(first.id).not.toBe(second.id);
    expect((await activityMaterials(db, second.id)).readings).toEqual((await activityMaterials(db, first.id)).readings);
    expect(await count("course_content", nextTerm)).toBe(1);
    expect(await count("course_guides", nextTerm)).toBe(1);
  });

  it("copies nothing student-side", async () => {
    const copied = await copyActivity(db, prof, activity, nextTerm, randomUUID());
    if (!copied.ok) throw new Error(copied.reason);
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from attempts where activity_id = $1", [copied.id]);
    expect(n).toBe(0);
    expect(await copyRow(copied.id)).toMatchObject({ status: "draft", lti_resource_link_id: null, lti_line_item_url: null });
  });

  it("returns the first copy on a retry with the same key", async () => {
    const key = randomUUID();
    const first = await copyActivity(db, prof, activity, nextTerm, key);
    const again = await copyActivity(db, prof, activity, nextTerm, key);
    expect(again).toEqual(first);
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from activities where course_id = $1", [nextTerm]);
    expect(n).toBe(1);
    expect(await count("course_content", nextTerm)).toBe(1);
  });

  it("refuses unless the actor teaches both courses", async () => {
    const theirs = await newCourse(other, "W27");
    expect(await copyActivity(db, other, activity, theirs, randomUUID())).toEqual({
      ok: false,
      reason: "That assignment isn't one of yours.",
    });
    expect(await copyActivity(db, prof, activity, theirs, randomUUID())).toEqual({
      ok: false,
      reason: "That course isn't one you teach.",
    });
    expect(await count("activities", theirs)).toBe(0);
    expect(await count("course_content", theirs)).toBe(0);
  });
});
