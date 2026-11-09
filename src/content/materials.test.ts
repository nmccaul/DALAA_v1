import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { saveGuide } from "./guide";
import { listCourseMaterials, mergeMaterials, type Material } from "./materials";
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

  it("lists a saved web page with its address, and refuses a web page without one", async () => {
    const page = await saveContent(db, prof, course, randomUUID(), {
      kind: "web",
      name: "Chatbot refund ruling",
      html: "<p>The tribunal ruled.</p>",
      url: "https://example.com/ruling",
    });
    expect(page).toMatchObject({ ok: true, content: { source: "web" } });
    expect(await listCourseMaterials(db, prof, course)).toMatchObject([{ source: "web", url: "https://example.com/ruling" }]);
    await expect(
      db.query(
        `insert into course_content (course_id, source, name, body, creation_key, created_by)
         values ($1, 'web', 'x', 'x', $2, $3)`,
        [course, randomUUID(), prof.userId],
      ),
    ).rejects.toThrow();
  });

  it("shows nothing for a course the actor doesn't teach", async () => {
    await saveContent(db, prof, course, randomUUID(), paste("Harbor Bikes case"));
    expect(await listCourseMaterials(db, other, course)).toEqual([]);
  });
});

describe("mergeMaterials", () => {
  const page = { page_id: 1, url: "harbor-bikes", title: "Harbor Bikes", updated_at: "2026-11-01T00:00:00Z", published: true };
  const file = {
    id: 9,
    display_name: "Syllabus",
    filename: "syllabus.pdf",
    "content-type": "application/pdf",
    size: 10,
    url: "https://canvas/files/9",
    updated_at: "2026-10-01T00:00:00Z",
  };
  const saved = (over: Partial<Material>): Material => ({
    id: randomUUID(),
    name: "Harbor Bikes",
    source: "canvas-page",
    seenBy: "students",
    createdAt: new Date("2026-11-02T00:00:00Z"),
    usedIn: [],
    url: null,
    ...over,
  });

  it("lists every Canvas page and file without importing, as In Canvas", () => {
    const rows = mergeMaterials([], { pages: [page], files: [file] });
    expect(rows.map((r) => [r.name, r.source, r.seenBy])).toEqual([
      ["Harbor Bikes", "canvas-page", "canvas"],
      ["Syllabus", "canvas-file", "canvas"],
    ]);
  });

  it("shows a Canvas item an activity uses once, with its activities, matching a file by either name", () => {
    const rows = mergeMaterials(
      [
        saved({ usedIn: [{ id: "a1", title: "Second store" }] }),
        saved({ name: "syllabus.pdf", source: "canvas-file", usedIn: [{ id: "a2", title: "Policies" }] }),
      ],
      { pages: [page], files: [file] },
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.name === "Harbor Bikes")).toMatchObject({ seenBy: "students", usedIn: [{ title: "Second store" }] });
    expect(rows.find((r) => r.name === "Syllabus")).toMatchObject({ seenBy: "students", usedIn: [{ title: "Policies" }] });
  });

  it("keeps uploads, pastes, AI-only notes and copies of Canvas items no longer in Canvas as their own rows", () => {
    const rows = mergeMaterials(
      [
        saved({ name: "Notes", source: "paste" }),
        saved({ name: "Harbor Bikes", seenBy: "ai" }),
        saved({ name: "Deleted page" }),
      ],
      { pages: [page], files: [] },
    );
    expect(rows.map((r) => [r.name, r.seenBy]).sort()).toEqual([
      ["Deleted page", "students"],
      ["Harbor Bikes", "ai"],
      ["Harbor Bikes", "canvas"],
      ["Notes", "students"],
    ]);
  });

  it("works without Canvas", () => {
    expect(mergeMaterials([saved({ source: "upload" })], null)).toHaveLength(1);
  });
});
