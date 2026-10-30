import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import { MAX_UPLOAD_BYTES, readContent } from "@/content/read";
import { createCourse } from "@/courses/create";
import type { Actor } from "@/db/scope";
import type { Db } from "@/db/types";
import { canvasClient, type CanvasFile } from "./client";
import type { TeacherCanvas } from "./connection";
import { fetchCanvasFile, fetchCanvasPage, listCanvasContent, listCourseCanvasContent, saveFromCanvas } from "./content";
import { importCourse } from "./import";
import { PRACTICE_TOKEN, practiceCanvas } from "./practice/server";

const BASE = "https://dalaa.test/practice-canvas";

/** The real client against practice Canvas, recording each request. */
function practice(token = PRACTICE_TOKEN) {
  const calls: string[] = [];
  const client = canvasClient({
    baseUrl: BASE,
    token,
    fetch: async (input, init) => {
      calls.push(String(input));
      return practiceCanvas(new Request(input, init));
    },
  });
  return { client, calls };
}

/** A client whose file metadata and download are scripted, for limits and odd URLs. */
function scripted(file: Partial<CanvasFile>, download: () => Response) {
  const meta: CanvasFile = {
    id: 1,
    display_name: "case.txt",
    filename: "case.txt",
    "content-type": "text/plain",
    size: 10,
    url: `${BASE}/files/1/download?verifier=v`,
    updated_at: "2026-10-01T00:00:00Z",
    ...file,
  };
  const downloads: string[] = [];
  const client = canvasClient({
    baseUrl: BASE,
    token: "t",
    fetch: async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/")) return Response.json(meta);
      downloads.push(url);
      return download();
    },
  });
  return { client, downloads };
}

describe("listCanvasContent", () => {
  it("lists every page, published or not, and only the files DALAA can read", async () => {
    const { pages, files } = await listCanvasContent(practice().client, 1101);
    expect(pages.map((p) => [p.title, p.published])).toEqual([
      ["Case: Harbor Bikes", false],
      ["Syllabus notes", true],
    ]);
    expect(pages[0]).not.toHaveProperty("body");
    expect(files.map((f) => f.display_name)).toEqual(["Harbor Bikes data.md", "Reading guide.txt"]);
  });
});

describe("fetchCanvasPage", () => {
  it("reads the page as plain text, keeping headings, lists and link text", async () => {
    const fetched = await fetchCanvasPage(practice().client, 1101, "case-harbor-bikes");
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    const read = await readContent(fetched.input);
    expect(read).toMatchObject({ ok: true, source: "canvas-page", name: "Case: Harbor Bikes" });
    if (!read.ok) return;
    expect(read.body).toContain("Harbor Bikes\n\nHarbor Bikes rents bicycles");
    expect(read.body).toContain("Season: May–September");
    expect(read.body).toContain("Should the owner add e-bikes, cut prices");
    expect(read.body).not.toMatch(/<|example\.com|Harbor photo/);
  });

  it("says so when the page is gone or the connection is refused", async () => {
    expect(await fetchCanvasPage(practice().client, 1101, "no-such-page")).toEqual({
      ok: false,
      reason: "That page isn't in Canvas anymore. Pick another.",
      reconnect: false,
    });
    expect(await fetchCanvasPage(practice("expired").client, 1101, "case-harbor-bikes")).toMatchObject({
      ok: false,
      reconnect: true,
    });
  });

  it("treats a page with no body as having no text", async () => {
    const client = canvasClient({
      baseUrl: BASE,
      token: "t",
      fetch: async () => Response.json({ page_id: 1, url: "x", title: "Empty", updated_at: "", published: true, body: null }),
    });
    const fetched = await fetchCanvasPage(client, 1, "x");
    expect(fetched.ok && (await readContent(fetched.input))).toEqual({ ok: false, reason: "Empty has no text in it." });
  });
});

describe("fetchCanvasFile", () => {
  it("downloads the file through its verifier link and reads it as a Canvas file", async () => {
    const { client, calls } = practice();
    const fetched = await fetchCanvasFile(client, 1101, 8001);
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(await readContent(fetched.input)).toEqual({
      ok: true,
      source: "canvas-file",
      name: "Harbor Bikes data.md",
      body: "# Harbor Bikes data\n\nRentals by month: May 310, June 420.",
    });
    expect(calls.at(-1)).toBe(`${BASE}/files/8001/download?verifier=practice-8001`);
  });

  it("refuses a file Canvas says is too big without downloading it", async () => {
    const { client, downloads } = scripted({ size: MAX_UPLOAD_BYTES + 1 }, () => new Response("x"));
    expect(await fetchCanvasFile(client, 1, 1)).toMatchObject({ ok: false, reason: "That file is over 4 MB. Use a smaller file, or paste the part students need." });
    expect(downloads).toEqual([]);
  });

  it("stops reading a download that turns out bigger than the limit", async () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    const { client } = scripted({}, () => new Response(new Blob([big]).stream()));
    expect(await fetchCanvasFile(client, 1, 1)).toMatchObject({ ok: false, reason: expect.stringContaining("over 4 MB") });
  });

  it("never fetches a download link on another host", async () => {
    const { client, downloads } = scripted({ url: "https://elsewhere.test/files/1" }, () => new Response("x"));
    expect(await fetchCanvasFile(client, 1, 1)).toMatchObject({ ok: false, reason: "Canvas didn't answer. Try again in a minute." });
    expect(downloads).toEqual([]);
  });

  it("uses the stored filename when the display name lost its extension", async () => {
    const { client } = scripted({ display_name: "Case notes", filename: "case-notes.txt" }, () => new Response("Notes"));
    const fetched = await fetchCanvasFile(client, 1, 1);
    expect(fetched.ok && fetched.input.name).toBe("case-notes.txt");
  });

  it("says so when the file is gone", async () => {
    expect(await fetchCanvasFile(practice().client, 1101, 9999)).toMatchObject({
      ok: false,
      reason: "That file isn't in Canvas anymore. Pick another.",
    });
  });
});

describe("a course's Canvas content", () => {
  let db: Db;
  let prof: Actor;
  let other: Actor;
  let courseId: string;
  const asPractice: () => TeacherCanvas = () => ({ client: practice().client, mode: "practice" });

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

  it("lists the linked Canvas course's pages and files", async () => {
    const r = await listCourseCanvasContent(db, prof, asPractice(), courseId);
    expect(r.ok && r.list.pages.map((p) => p.url)).toContain("case-harbor-bikes");
  });

  it("says why it can't list: not linked, the other Canvas, not theirs, connection refused", async () => {
    const manual = await createCourse(db, prof, { creationKey: randomUUID(), code: "X", title: "X", term: "W", students: [] });
    expect(await listCourseCanvasContent(db, prof, asPractice(), manual.courseId)).toEqual({ ok: false, reason: "not-linked" });
    const real: TeacherCanvas = { client: practice().client, mode: "canvas" };
    expect(await listCourseCanvasContent(db, prof, real, courseId)).toEqual({ ok: false, reason: "wrong-canvas" });
    expect(await listCourseCanvasContent(db, other, asPractice(), courseId)).toEqual({ ok: false, reason: "not-yours" });
    const expired: TeacherCanvas = { client: practice("expired").client, mode: "practice" };
    expect(await listCourseCanvasContent(db, prof, expired, courseId)).toEqual({ ok: false, reason: "reconnect" });
  });

  it("saves a picked page once, even when the pick is sent twice", async () => {
    const key = randomUUID();
    const first = await saveFromCanvas(db, prof, asPractice(), courseId, key, { kind: "page", url: "case-harbor-bikes" });
    expect(first).toMatchObject({ ok: true, content: { source: "canvas-page", name: "Case: Harbor Bikes" } });
    expect(await saveFromCanvas(db, prof, asPractice(), courseId, key, { kind: "page", url: "case-harbor-bikes" })).toEqual(first);
    expect(await db.query("select course_id from course_content")).toEqual([{ course_id: courseId }]);
  });

  it("saves a pick as an AI-only guide, kept out of what students read", async () => {
    const saved = await saveFromCanvas(db, prof, asPractice(), courseId, randomUUID(), { kind: "page", url: "case-harbor-bikes" }, "guide");
    expect(saved).toMatchObject({ ok: true, content: { source: "canvas-page", name: "Case: Harbor Bikes" } });
    expect(await db.query("select course_id from course_guides")).toEqual([{ course_id: courseId }]);
    expect(await db.query("select id from course_content")).toEqual([]);
  });

  it("saves a picked file", async () => {
    expect(await saveFromCanvas(db, prof, asPractice(), courseId, randomUUID(), { kind: "file", id: 8001 })).toMatchObject({
      ok: true,
      content: { source: "canvas-file", name: "Harbor Bikes data.md" },
    });
  });

  it("saves nothing for someone else's course, or a page that's gone", async () => {
    expect(
      await saveFromCanvas(db, other, asPractice(), courseId, randomUUID(), { kind: "page", url: "case-harbor-bikes" }),
    ).toMatchObject({ ok: false, reconnect: false });
    expect(await saveFromCanvas(db, prof, asPractice(), courseId, randomUUID(), { kind: "page", url: "gone" })).toEqual({
      ok: false,
      reason: "That page isn't in Canvas anymore. Pick another.",
      reconnect: false,
    });
    const expired: TeacherCanvas = { client: practice("expired").client, mode: "practice" };
    expect(
      await saveFromCanvas(db, prof, expired, courseId, randomUUID(), { kind: "page", url: "case-harbor-bikes" }),
    ).toMatchObject({ ok: false, reconnect: true });
    expect(await db.query("select id from course_content")).toEqual([]);
  });
});
