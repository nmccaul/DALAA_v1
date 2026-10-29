import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { getContent, saveContent } from "./store";

describe("saveContent", () => {
  let db: Db;
  let inst: string;
  let prof: Actor;
  let other: Actor;
  let course: string;

  const actor = async (netId: string): Promise<Actor> => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
      [inst, netId],
    );
    return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
  };
  const newCourse = async (owner: Actor) => {
    const [{ id }] = await db.query<{ id: string }>(
      "insert into courses (institution_id, code, title, term, created_by) values ($1, 'C', 'C', 'W27', $2) returning id",
      [inst, owner.userId],
    );
    await db.query("insert into course_members (course_id, user_id, role) values ($1, $2, 'instructor')", [id, owner.userId]);
    return id;
  };
  const paste = (text: string) => ({ kind: "paste" as const, name: "Harbor Bikes", text });

  beforeEach(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    prof = await actor("prof");
    other = await actor("other");
    course = await newCourse(prof);
  });

  it("saves read content to the teacher's course", async () => {
    const r = await saveContent(db, prof, course, randomUUID(), paste("Sales fell."));
    expect(r).toMatchObject({ ok: true, content: { source: "paste", name: "Harbor Bikes", body: "Sales fell." } });
    const rows = await db.query("select course_id, created_by from course_content");
    expect(rows).toEqual([{ course_id: course, created_by: prof.userId }]);
  });

  it("returns the first save on a retry with the same key", async () => {
    const key = randomUUID();
    const first = await saveContent(db, prof, course, key, paste("Sales fell."));
    const again = await saveContent(db, prof, course, key, paste("Sales fell."));
    expect(again).toEqual(first);
    expect(await db.query("select id from course_content")).toHaveLength(1);
  });

  it("refuses a course the actor doesn't teach, and someone else's key", async () => {
    expect(await saveContent(db, other, course, randomUUID(), paste("x"))).toEqual({
      ok: false,
      reason: "That course isn't one you teach.",
    });
    const key = randomUUID();
    await saveContent(db, prof, course, key, paste("x"));
    await expect(saveContent(db, other, await newCourse(other), key, paste("x"))).rejects.toThrow(/someone else/);
  });

  it("passes on what the reader refuses, saving nothing", async () => {
    expect(await saveContent(db, prof, course, randomUUID(), paste(""))).toMatchObject({ ok: false });
    expect(await db.query("select id from course_content")).toEqual([]);
  });

  it("lets an activity use content from its own course only", async () => {
    const r = await saveContent(db, prof, course, randomUUID(), paste("Sales fell."));
    if (!r.ok) throw new Error(r.reason);
    const addActivity = (courseId: string) =>
      db.query(
        "insert into activities (course_id, tool, title, settings, content_id, created_by) values ($1, 'study-chat', 'A', '{}', $2, $3)",
        [courseId, r.content.id, prof.userId],
      );
    await addActivity(course);
    await expect(addActivity(await newCourse(prof))).rejects.toThrow(/foreign key/);
  });

  it("gets saved content back for the course's teachers only", async () => {
    const r = await saveContent(db, prof, course, randomUUID(), paste("Sales fell."));
    if (!r.ok) throw new Error(r.reason);
    expect(await getContent(db, prof, course, r.content.id)).toEqual(r.content);
    expect(await getContent(db, other, course, r.content.id)).toBeNull();
    expect(await getContent(db, prof, await newCourse(prof), r.content.id)).toBeNull();
    expect(await getContent(db, prof, course, "not-an-id")).toBeNull();
  });
});
