import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { setActivityMaterials } from "@/activities/materials";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { deleteMaterial } from "./delete";

describe("deleteMaterial", () => {
  let db: Db;
  let inst: string;
  let prof: Actor;
  let other: Actor;
  let course: string;
  let reading: string;
  let note: string;

  const actor = async (netId: string): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
  };
  const material = async (table: "course_content" | "course_guides", name: string) =>
    (
      await db.query<{ id: string }>(
        `insert into ${table} (course_id, source, name, body, creation_key, created_by)
         values ($1, 'paste', $2, $3, $4, $5) returning id`,
        [course, name, `${name} body`, randomUUID(), prof.userId],
      )
    )[0].id;
  const activity = async (title: string, status: "draft" | "published") =>
    (
      await db.query<{ id: string }>(
        `insert into activities (course_id, tool, title, settings, points, status, created_by)
         values ($1, 'study-chat', $2, '{}', 10, $3, $4) returning id`,
        [course, title, status, prof.userId],
      )
    )[0].id;
  const exists = async (table: string, id: string) =>
    (await db.query<{ n: number }>(`select count(*)::int as n from ${table} where id = $1`, [id]))[0].n === 1;

  beforeEach(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    prof = await actor("prof");
    other = await actor("other");
    [{ id: course }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'F26', $2) returning id",
      [inst, prof.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [course, prof.userId]);
    reading = await material("course_content", "Case");
    note = await material("course_guides", "Teaching note");
  });

  it("deletes an unused reading with its PDF, and an unused AI-only note", async () => {
    await db.query("insert into content_files (content_id, media_type, bytes) values ($1, 'application/pdf', '\\x25504446')", [reading]);
    expect(await deleteMaterial(db, prof, course, "students", reading)).toEqual({ ok: true });
    expect(await exists("course_content", reading)).toBe(false);
    expect((await db.query("select 1 from content_files where content_id = $1", [reading])).length).toBe(0);

    expect(await deleteMaterial(db, prof, course, "ai", note)).toEqual({ ok: true });
    expect(await exists("course_guides", note)).toBe(false);
  });

  it("takes it out of drafts that use it, keeping their other materials", async () => {
    const draft = await activity("Draft", "draft");
    const second = await material("course_content", "Other reading");
    expect(await setActivityMaterials(db, prof, draft, { contentIds: [reading, second], guideIds: [note] })).toEqual({ ok: true });
    await db.query("update activities set content_id = $2, guide_id = $3 where id = $1", [draft, reading, note]);

    expect(await deleteMaterial(db, prof, course, "students", reading)).toEqual({ ok: true });
    expect(await exists("course_content", reading)).toBe(false);
    const left = await db.query<{ content_id: string | null; guide_id: string | null }>(
      "select content_id, guide_id from activity_materials where activity_id = $1 order by position",
      [draft],
    );
    expect(left).toEqual([
      { content_id: second, guide_id: null },
      { content_id: null, guide_id: note },
    ]);
    const [retired] = await db.query("select content_id, guide_id from activities where id = $1", [draft]);
    expect(retired).toEqual({ content_id: null, guide_id: note });
  });

  it("keeps one a published activity uses, and says which", async () => {
    const live = await activity("Harbor Bikes", "published");
    expect(await setActivityMaterials(db, prof, live, { contentIds: [], guideIds: [note] })).toEqual({ ok: true });
    expect(await deleteMaterial(db, prof, course, "ai", note)).toEqual({
      ok: false,
      reason: 'It\'s in "Harbor Bikes", which students can already open. Take it out of that activity first.',
    });
    expect(await exists("course_guides", note)).toBe(true);
  });

  it("refuses someone who doesn't teach the course; a second delete is fine", async () => {
    expect(await deleteMaterial(db, other, course, "students", reading)).toMatchObject({ ok: false });
    expect(await exists("course_content", reading)).toBe(true);
    expect(await deleteMaterial(db, prof, course, "students", reading)).toEqual({ ok: true });
    expect(await deleteMaterial(db, prof, course, "students", reading)).toEqual({ ok: true });
  });
});
