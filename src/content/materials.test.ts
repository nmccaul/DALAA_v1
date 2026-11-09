import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { saveGuide } from "./guide";
import { listCourseMaterials } from "./materials";
import { saveContent } from "./store";

describe("listCourseMaterials", () => {
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
  const paste = (name: string) => ({ kind: "paste" as const, name, text: "Sales fell." });

  beforeEach(async () => {
    db = await testDb();
    [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    prof = await actor("prof");
    other = await actor("other");
    course = await newCourse(prof);
  });

  it("lists what students read and what only the AI reads, with the activities using each", async () => {
    const reading = await saveContent(db, prof, course, randomUUID(), paste("Harbor Bikes case"));
    const note = await saveGuide(db, prof, course, randomUUID(), paste("Teaching note"));
    await saveContent(db, prof, course, randomUUID(), paste("Unused reading"));
    if (!reading.ok || !note.ok) throw new Error("setup");
    await db.query(
      `insert into activities (course_id, tool, title, settings, content_id, guide_id, created_by)
       values ($1, 'study-chat', 'Second store', '{}', $2, $3, $4)`,
      [course, reading.content.id, note.content.id, prof.userId],
    );

    const materials = await listCourseMaterials(db, prof, course);
    const byName = Object.fromEntries(materials.map((m) => [m.name, m]));
    expect(materials).toHaveLength(3);
    expect(byName["Harbor Bikes case"]).toMatchObject({ seenBy: "students", source: "paste", usedIn: [{ title: "Second store" }] });
    expect(byName["Teaching note"]).toMatchObject({ seenBy: "ai", usedIn: [{ title: "Second store" }] });
    expect(byName["Unused reading"].usedIn).toEqual([]);
  });

  it("shows nothing for a course the actor doesn't teach", async () => {
    await saveContent(db, prof, course, randomUUID(), paste("Harbor Bikes case"));
    expect(await listCourseMaterials(db, other, course)).toEqual([]);
  });
});
