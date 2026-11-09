import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { canvasClient } from "@/canvas/client";
import type { TeacherCanvas } from "@/canvas/connection";
import { importCourse } from "@/canvas/import";
import { PRACTICE_TOKEN, practiceCanvas } from "@/canvas/practice/server";
import { saveGuide } from "@/content/guide";
import { mergeMaterials, type Material } from "@/content/materials";
import { saveContent } from "@/content/store";
import { createCourse } from "@/courses/create";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { testDb } from "@/test/db";
import { materialsFromQuery, materialsQuery, parsePicks, pickCreationKey, pickValue, savePicks } from "./picks";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("pick values", () => {
  const material = (m: Partial<Material>): Material => ({
    id: A,
    name: "Case: Harbor Bikes",
    source: "canvas-page",
    url: null,
    seenBy: "students",
    createdAt: new Date("2026-11-01"),
    usedIn: [],
    ...m,
  });
  const page = { page_id: 1, url: "case-harbor-bikes", title: "Case: Harbor Bikes", updated_at: "2026-10-01T00:00:00Z" };

  it("names a saved reading, a saved AI-only note, and an unsaved Canvas item", () => {
    const rows = mergeMaterials(
      [material({ id: A, source: "paste", name: "Notes" }), material({ id: B, seenBy: "ai", source: "upload", name: "Key" })],
      { pages: [{ ...page, title: "Other page", url: "other-page" } as never], files: [] },
    );
    expect(rows.map(pickValue).sort()).toEqual([`content:${A}`, `guide:${B}`, "page:other-page"]);
  });

  it("uses the saved copy of a Canvas page that's already saved, so it isn't fetched again", () => {
    const [row] = mergeMaterials([material({})], { pages: [page as never], files: [] });
    expect(pickValue(row)).toBe(`content:${A}`);
  });

  it("sorts ticked values and drops repeats and anything malformed", () => {
    expect(
      parsePicks([`content:${A}`, `guide:${B}`, "page:case-harbor-bikes", "file:8001", `content:${A}`, "content:nope", "file:x", "evil:1", ""]),
    ).toEqual({
      contentIds: [A],
      guideIds: [B],
      canvas: [
        { kind: "page", url: "case-harbor-bikes" },
        { kind: "file", id: 8001 },
      ],
    });
  });

  it("round-trips the ids through the URL and drops malformed ones", () => {
    const query = materialsQuery({ contentIds: [A, B], guideIds: [B] });
    expect(materialsFromQuery(Object.fromEntries(new URLSearchParams(query)))).toEqual({ contentIds: [A, B], guideIds: [B] });
    expect(materialsQuery({ contentIds: [A], guideIds: [] })).toBe(`content=${A}`);
    expect(materialsFromQuery({ content: `${A},drop table,${A}`, guide: ["x", "y"] })).toEqual({ contentIds: [A], guideIds: [] });
  });

  it("derives one stable key per Canvas item from the form's key", () => {
    const key = randomUUID();
    const page = { kind: "page", url: "case-harbor-bikes" } as const;
    expect(pickCreationKey(key, page)).toBe(pickCreationKey(key, page));
    expect(pickCreationKey(key, page)).not.toBe(pickCreationKey(key, { kind: "file", id: 8001 }));
    expect(pickCreationKey(key, page)).not.toBe(pickCreationKey(randomUUID(), page));
    expect(pickCreationKey(key, page)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("savePicks", () => {
  let db: Db;
  let prof: Actor;
  let other: Actor;
  let courseId: string;
  const asPractice = (): TeacherCanvas => ({
    client: canvasClient({ baseUrl: "https://dalaa.test/practice-canvas", token: PRACTICE_TOKEN, fetch: async (i, init) => practiceCanvas(new Request(i, init)) }),
    mode: "practice",
  });
  const paste = (name: string) => ({ kind: "paste" as const, name, text: `${name} body text.` });

  beforeEach(async () => {
    db = await testDb();
    const [{ id: inst }] = await db.query<{ id: string }>("select id from institutions");
    const actor = async (netId: string): Promise<Actor> => {
      const [{ id }] = await db.query<{ id: string }>(
        "insert into users (institution_id, external_id, display_name) values ($1, $2, $2) returning id",
        [inst, netId],
      );
      return { userId: id, institutionId: inst, netId, displayName: netId, isStaff: true, isAdmin: false };
    };
    prof = await actor("prof");
    other = await actor("other");
    const imported = await importCourse(db, prof, asPractice(), 1101, randomUUID());
    if (!imported.ok) throw new Error(imported.reason);
    courseId = imported.courseId;
  });

  it("returns saved readings and notes in the order ticked, saving Canvas items as readings", async () => {
    const reading = await saveContent(db, prof, courseId, randomUUID(), paste("Reading"));
    const note = await saveGuide(db, prof, courseId, randomUUID(), paste("Key"));
    if (!reading.ok || !note.ok) throw new Error("save failed");
    const picks = parsePicks([`content:${reading.content.id}`, "page:case-harbor-bikes", `guide:${note.content.id}`]);

    const saved = await savePicks(db, prof, asPractice(), courseId, randomUUID(), picks);
    if (!saved.ok) throw new Error(saved.reason);
    expect(saved.guideIds).toEqual([note.content.id]);
    expect(saved.contentIds).toHaveLength(2);
    expect(saved.contentIds[0]).toBe(reading.content.id);
    const [page] = await db.query<{ name: string }>("select name from course_content where id = $1", [saved.contentIds[1]]);
    expect(page.name).toBe("Case: Harbor Bikes");
  });

  it("saves each Canvas item once when the same form is sent twice", async () => {
    const key = randomUUID();
    const picks = parsePicks(["page:case-harbor-bikes"]);
    const first = await savePicks(db, prof, asPractice(), courseId, key, picks);
    expect(await savePicks(db, prof, asPractice(), courseId, key, picks)).toEqual(first);
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from course_content where course_id = $1", [courseId]);
    expect(n).toBe(1);
  });

  it("needs at least one thing students read", async () => {
    const note = await saveGuide(db, prof, courseId, randomUUID(), paste("Key"));
    if (!note.ok) throw new Error("save failed");
    expect(await savePicks(db, prof, null, courseId, randomUUID(), parsePicks([`guide:${note.content.id}`]))).toEqual({
      ok: false,
      reason: "Pick at least one material students read (Students + AI).",
      reconnect: false,
    });
  });

  it("refuses another course's material, a course the actor doesn't teach, and Canvas items without a connection", async () => {
    const elsewhere = await createCourse(db, prof, { creationKey: randomUUID(), code: "X", title: "X", term: "W", students: [] });
    const foreign = await saveContent(db, prof, elsewhere.courseId, randomUUID(), paste("Elsewhere"));
    if (!foreign.ok) throw new Error("save failed");
    expect(await savePicks(db, prof, null, courseId, randomUUID(), parsePicks([`content:${foreign.content.id}`]))).toMatchObject({
      ok: false,
      reason: "One of those materials isn't in this course anymore. Reload the page and pick again.",
    });
    expect(await savePicks(db, other, asPractice(), courseId, randomUUID(), parsePicks(["page:case-harbor-bikes"]))).toMatchObject({
      ok: false,
      reason: "That course isn't one you teach.",
    });
    expect(await savePicks(db, prof, null, courseId, randomUUID(), parsePicks(["page:case-harbor-bikes"]))).toEqual({
      ok: false,
      reason: "Connect Canvas to use its Pages and Files.",
      reconnect: true,
    });
  });

  it("passes on Canvas's refusal for an item that's gone", async () => {
    expect(await savePicks(db, prof, asPractice(), courseId, randomUUID(), parsePicks(["page:gone"]))).toEqual({
      ok: false,
      reason: "That page isn't in Canvas anymore. Pick another.",
      reconnect: false,
    });
  });
});
