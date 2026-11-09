/**
 * Text from Word (.docx) and PowerPoint (.pptx) files. Both are zip files of
 * XML; we read only the parts with the words in them, paragraph by paragraph.
 * Pure: no database, no network. Returns null for a file that isn't a valid
 * document (damaged, password-protected, or an old .doc/.ppt renamed).
 */

import { unzipSync, type UnzipFileInfo } from "fflate";

/** Uncompressed size we'll unpack: generous for text, small enough to refuse a zip bomb. */
const MAX_UNZIPPED_BYTES = 40 * 1024 * 1024;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e] ?? whole;
  });
}

/**
 * The text of an Office XML part: one line per paragraph (`<w:p>` or `<a:p>`),
 * the words from `<w:t>`/`<a:t>`, tabs and line breaks kept.
 */
export function officeXmlText(xml: string): string {
  const paragraphs = xml.split(/<\/(?:w|a):p>/);
  const lines = paragraphs.map((p) =>
    p
      .replace(/<(?:w|a):tab\b[^>]*\/>/g, "<t>\t</t>")
      .replace(/<(?:w|a):br\b[^>]*\/>/g, "<t>\n</t>")
      .match(/<(?:(?:w|a):)?t(?:\s[^>]*)?>[^<]*<\/(?:(?:w|a):)?t>/g)
      ?.map((run) => decodeXml(run.replace(/<[^>]+>/g, "")))
      .join("") ?? "",
  );
  // The text after the last paragraph closes is not a paragraph.
  return lines.slice(0, -1).join("\n");
}

function unzip(bytes: Uint8Array, wanted: (name: string) => boolean): Record<string, Uint8Array> | null {
  let total = 0;
  try {
    return unzipSync(bytes, {
      filter: (f: UnzipFileInfo) => {
        if (!wanted(f.name)) return false;
        total += f.originalSize;
        if (total > MAX_UNZIPPED_BYTES) throw new Error("too big unzipped");
        return true;
      },
    });
  } catch {
    return null;
  }
}

const utf8 = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);

/** A Word document's body text, or null if it isn't a readable .docx. */
export function docxText(bytes: Uint8Array): string | null {
  const parts = unzip(bytes, (n) => n === "word/document.xml");
  const doc = parts?.["word/document.xml"];
  return doc ? officeXmlText(utf8(doc)) : null;
}

/** A PowerPoint deck's text, slide by slide ("Slide 1", ...), or null if it isn't a readable .pptx. */
export function pptxText(bytes: Uint8Array): string | null {
  const slide = /^ppt\/slides\/slide(\d+)\.xml$/;
  const parts = unzip(bytes, (n) => slide.test(n));
  if (!parts) return null;
  const slides = Object.keys(parts)
    .map((name) => ({ n: Number(slide.exec(name)![1]), xml: utf8(parts[name]) }))
    .sort((a, b) => a.n - b.n);
  if (slides.length === 0) return null;
  return slides.map((s) => `Slide ${s.n}\n${officeXmlText(s.xml)}`).join("\n\n");
}
