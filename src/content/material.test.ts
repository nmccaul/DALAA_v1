import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { setActivityMaterials } from "@/activities/materials";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { getMaterial, updateMaterial } from "./material";
import { MAX_CHARS } from "./read";

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

describe("getMaterial", () => {
  it("finds a reading or an AI-only note by id, with where it's used and whether it has a PDF", async () => {
    const [{ id: activity }] = await db.query<{ id: string }>(
      `insert into activities (course_id, tool, title, settings, points, status, created_by)
       values ($1, 'study-chat', 'Harbor Bikes', '{}', 10, 'published', $2) returning id`,
      [course, prof.userId],
    );
    expect(await setActivityMaterials(db, prof, activity, { contentIds: [reading], guideIds: [] })).toEqual({ ok: true });
    await db.query("insert into content_files (content_id, media_type, bytes) values ($1, 'application/pdf', '\\x25504446')", [reading]);

    expect(await getMaterial(db, prof, course, reading)).toMatchObject({
      seenBy: "students",
      name: "Case",
      body: "Case body",
      hasFile: true,
      updatedAt: null,
      usedIn: [{ id: activity, title: "Harbor Bikes", published: true }],
    });
    expect(await getMaterial(db, prof, course, note)).toMatchObject({ seenBy: "ai", name: "Teaching note", hasFile: false, usedIn: [] });
  });

  it("shows nothing to someone who doesn't teach the course, or for a made-up id", async () => {
    expect(await getMaterial(db, other, course, reading)).toBeNull();
    expect(await getMaterial(db, prof, course, randomUUID())).toBeNull();
    expect(await getMaterial(db, prof, course, "nope")).toBeNull();
  });
});

describe("updateMaterial", () => {
  it("saves a new name and text, trimmed, and when it was edited", async () => {
    expect(await updateMaterial(db, prof, course, note, { name: "  Negotiation: the seller's side ", body: "Line one\r\nLine two\n" })).toEqual({ ok: true });
    expect(await getMaterial(db, prof, course, note)).toMatchObject({ name: "Negotiation: the seller's side", body: "Line one\nLine two", updatedAt: expect.any(Date) });
  });

  it("refuses an empty name or text, text over the limit, and anyone who doesn't teach the course", async () => {
    expect(await updateMaterial(db, prof, course, reading, { name: " ", body: "x" })).toMatchObject({ ok: false });
    expect(await updateMaterial(db, prof, course, reading, { name: "Case", body: " " })).toMatchObject({ ok: false });
    expect(await updateMaterial(db, prof, course, reading, { name: "Case", body: "x".repeat(MAX_CHARS + 1) })).toMatchObject({ ok: false });
    expect(await updateMaterial(db, other, course, reading, { name: "Mine", body: "Mine" })).toMatchObject({ ok: false });
    expect(await getMaterial(db, prof, course, reading)).toMatchObject({ name: "Case", body: "Case body", updatedAt: null });
  });
});
