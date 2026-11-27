import { describe, expect, it } from "vitest";
import { titleFromFileName } from "./file-name";

describe("titleFromFileName", () => {
  it("drops the extension and reads underscores and hyphens as spaces", () => {
    expect(titleFromFileName("Harbor_bikes-case.pdf")).toBe("Harbor bikes case");
    expect(titleFromFileName("Truth15_FirstOffer.pdf")).toBe("Truth15 FirstOffer");
    expect(titleFromFileName("case__study--v2.docx")).toBe("case study v2");
  });

  it("keeps the teacher's capitalization and a name that already reads well", () => {
    expect(titleFromFileName("A Poor Wayfaring Man of Grief.pdf")).toBe("A Poor Wayfaring Man of Grief");
    expect(titleFromFileName("Notes.MD")).toBe("Notes");
  });

  it("keeps hyphens in a name that has spaces, and tidies the underscores in it", () => {
    expect(titleFromFileName("Dunning-Kruger Effect.pptx")).toBe("Dunning-Kruger Effect");
    expect(titleFromFileName("David Dunning_ Overcoming Overconfidence _ OpenMind Magazine.pdf")).toBe(
      "David Dunning Overcoming Overconfidence OpenMind Magazine",
    );
  });

  it("only drops the last extension, and falls back to the file name when nothing is left", () => {
    expect(titleFromFileName("report.v2.final.txt")).toBe("report.v2.final");
    expect(titleFromFileName("README")).toBe("README");
    expect(titleFromFileName("__.pdf")).toBe("__.pdf");
    expect(titleFromFileName(" .md ")).toBe(".md");
  });
});
