import { describe, expect, it } from "vitest";
import { pdf } from "@/test/pdf";
import { MAX_CHARS, MAX_UPLOAD_BYTES, readContent } from "./read";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("readContent: pasted text", () => {
  it("keeps the text, cleaned to one shape, named by the teacher or 'Pasted text'", async () => {
    expect(await readContent({ kind: "paste", name: "", text: "  Harbor Bikes\r\n\r\n\r\n\r\nSales fell.  \n" })).toEqual({
      ok: true,
      source: "paste",
      name: "Pasted text",
      body: "Harbor Bikes\n\nSales fell.",
    });
    expect(await readContent({ kind: "paste", name: " Case 1 ", text: "x" })).toMatchObject({ name: "Case 1" });
  });

  it("refuses an empty paste", async () => {
    expect(await readContent({ kind: "paste", name: "", text: " \n\t " })).toEqual({
      ok: false,
      reason: "Paste the text students should read.",
    });
  });

  it("refuses text over the length limit, saying how long it is", async () => {
    expect(await readContent({ kind: "paste", name: "", text: "a".repeat(MAX_CHARS) })).toMatchObject({ ok: true });
    const r = await readContent({ kind: "paste", name: "", text: "a".repeat(MAX_CHARS + 1) });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.reason).toMatch(/100,001 characters; the limit is 100,000/);
  });
});

describe("readContent: .txt and .md files", () => {
  it("reads UTF-8 text, dropping a byte-order mark and NULs", async () => {
    expect(await readContent({ kind: "file", name: "case.txt", bytes: bytes("﻿Café\u0000 owner") })).toEqual({
      ok: true,
      source: "upload",
      name: "case.txt",
      body: "Café owner",
    });
  });

  it("reads Markdown as it is, by extension in any case", async () => {
    expect(await readContent({ kind: "file", name: "Notes.MD", bytes: bytes("# Harbor Bikes\n\n- sales fell") })).toMatchObject({
      ok: true,
      body: "# Harbor Bikes\n\n- sales fell",
    });
  });

  it("refuses a file that isn't text, and an empty one", async () => {
    const binary = new Uint8Array([0xff, 0xfe, 0x00, 0xd8, 0x80]);
    expect(await readContent({ kind: "file", name: "case.txt", bytes: binary })).toEqual({
      ok: false,
      reason: "case.txt isn't plain text. Save it as UTF-8 text, or paste it.",
    });
    expect(await readContent({ kind: "file", name: "empty.md", bytes: bytes("\n\n") })).toEqual({
      ok: false,
      reason: "empty.md has no text in it.",
    });
  });
});

describe("readContent: .pdf files", () => {
  it("extracts the text", async () => {
    const r = await readContent({ kind: "file", name: "harbor.pdf", bytes: pdf(["Harbor Bikes", "Sales fell 20 percent."]) });
    expect(r).toMatchObject({ ok: true, source: "upload", name: "harbor.pdf" });
    expect(r.ok && r.body).toMatch(/Harbor Bikes\s+Sales fell 20 percent\./);
  });

  it("hands back the PDF itself, so students can see its pages", async () => {
    const file = pdf(["Harbor Bikes"]);
    const r = await readContent({ kind: "file", name: "harbor.pdf", bytes: file });
    expect(r.ok && r.pdf).toBe(file);
    const md = await readContent({ kind: "file", name: "harbor.md", bytes: bytes("# Harbor Bikes") });
    expect(md.ok && md.pdf).toBeUndefined();
  });

  it("rejoins a paragraph's printed lines into one", async () => {
    const r = await readContent({
      kind: "file",
      name: "harbor.pdf",
      bytes: pdf(["Sales fell twenty percent last year as the company lost its biggest", "retail partner.", "The board met in March."]),
    });
    expect(r.ok && r.body).toBe(
      "Sales fell twenty percent last year as the company lost its biggest retail partner.\nThe board met in March.",
    );
  });

  it("says a PDF without text may be a scan", async () => {
    expect(await readContent({ kind: "file", name: "scan.pdf", bytes: pdf() })).toEqual({
      ok: false,
      reason: "scan.pdf has no text we can read; it may be a scan. Paste the text instead.",
    });
  });

  it("refuses a file named .pdf that isn't one, or is damaged", async () => {
    const damaged = { ok: false, reason: "We couldn't read fake.pdf. It may be damaged or password-protected." };
    expect(await readContent({ kind: "file", name: "fake.pdf", bytes: bytes("hello") })).toEqual(damaged);
    expect(await readContent({ kind: "file", name: "fake.pdf", bytes: bytes("%PDF-1.4 garbage") })).toEqual(damaged);
  });
});

describe("readContent: any file", () => {
  it("refuses other file types", async () => {
    expect(await readContent({ kind: "file", name: "case.key", bytes: bytes("x") })).toEqual({
      ok: false,
      reason: "case.key isn't a file DALAA can read. Use a PDF, Word (.docx), PowerPoint (.pptx), .txt or .md file, or paste the text.",
    });
    expect(await readContent({ kind: "file", name: "README", bytes: bytes("x") })).toMatchObject({ ok: false });
  });

  it("refuses a file over the upload limit before reading it", async () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1).fill(0x61);
    expect(await readContent({ kind: "file", name: "big.txt", bytes: big })).toEqual({
      ok: false,
      reason: "big.txt is over 4 MB. Use a smaller file, or paste the part students need.",
    });
    const atLimit = new Uint8Array(MAX_UPLOAD_BYTES).fill(0x61);
    // At the byte limit the file is read, then held to the length limit.
    expect(await readContent({ kind: "file", name: "big.txt", bytes: atLimit })).toMatchObject({ ok: false, reason: /characters/ });
  });
});

describe("readContent: from Canvas", () => {
  it("labels Canvas pages and files by where they came from", async () => {
    expect(await readContent({ kind: "canvas-page", name: "Case", html: "<p>Sales &amp; costs</p>" })).toEqual({
      ok: true,
      source: "canvas-page",
      name: "Case",
      body: "Sales & costs",
    });
    expect(await readContent({ kind: "canvas-file", name: "a.txt", bytes: bytes("Hi") })).toMatchObject({
      source: "canvas-file",
    });
  });

  it("refuses a Canvas file of a type DALAA can't read", async () => {
    expect(await readContent({ kind: "canvas-file", name: "notes.docx", bytes: bytes("PK") })).toMatchObject({ ok: false });
  });
});
