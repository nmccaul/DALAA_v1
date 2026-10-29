import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, readContent } from "@/content/read";
import { canvasClient, type CanvasFile } from "./client";
import { fetchCanvasFile, fetchCanvasPage, listCanvasContent } from "./content";
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
