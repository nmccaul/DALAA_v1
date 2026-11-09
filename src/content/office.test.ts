import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { docxText, officeXmlText, pptxText } from "./office";
import { readContent } from "./read";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

const docx = (body: string) =>
  zipSync({ "word/document.xml": strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`) });
const para = (...runs: string[]) => `<w:p>${runs.map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join("")}</w:p>`;
const slide = (...lines: string[]) =>
  strToU8(`<p:sld ${A}><p:txBody>${lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sld>`);

describe("Word and PowerPoint text", () => {
  it("reads a .docx paragraph by paragraph, joining runs and decoding entities", () => {
    const text = docxText(docx(para("Harbor ", "Bikes") + para("Revenue &amp; margin: &#36;1.2M")));
    expect(text).toBe("Harbor Bikes\nRevenue & margin: $1.2M");
  });

  it("keeps tabs and line breaks", () => {
    expect(officeXmlText(`<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r></w:p>`)).toBe("a\tb\nc");
  });

  it("reads a .pptx slide by slide, in slide order", () => {
    const deck = zipSync({
      "ppt/slides/slide10.xml": slide("Ten"),
      "ppt/slides/slide2.xml": slide("Two", "Second line"),
      "ppt/slides/_rels/slide2.xml.rels": strToU8("<Relationships/>"),
    });
    expect(pptxText(deck)).toBe("Slide 2\nTwo\nSecond line\n\nSlide 10\nTen");
  });

  it("returns null for something that isn't a document", () => {
    expect(docxText(strToU8("not a zip"))).toBeNull();
    expect(pptxText(zipSync({ "hello.txt": strToU8("hi") }))).toBeNull();
  });

  it("reads uploads through readContent, and explains an old .doc", async () => {
    expect(await readContent({ kind: "file", name: "case.docx", bytes: docx(para("Sales fell.")) })).toEqual({
      ok: true,
      source: "upload",
      name: "case.docx",
      body: "Sales fell.",
    });
    const deck = zipSync({ "ppt/slides/slide1.xml": slide("Agenda") });
    expect(await readContent({ kind: "canvas-file", name: "week3.pptx", bytes: deck })).toMatchObject({
      ok: true,
      source: "canvas-file",
      body: "Slide 1\nAgenda",
    });
    const old = await readContent({ kind: "file", name: "case.doc", bytes: strToU8("x") });
    expect(old).toMatchObject({ ok: false });
    expect(old.ok || old.reason).toContain("Save it as .docx");
  });

  it("says a deck of only pictures has no text", async () => {
    const deck = zipSync({ "ppt/slides/slide1.xml": slide() });
    const r = await readContent({ kind: "file", name: "pics.pptx", bytes: deck });
    expect(r.ok || r.reason).toContain("only pictures");
  });
});
