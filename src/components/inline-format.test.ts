import { describe, expect, it } from "vitest";
import { inlinePieces } from "./inline-format";

describe("inlinePieces", () => {
  it("turns the model's emphasis into pieces (feedback 8c01e066: *why* showed its asterisks)", () => {
    expect(inlinePieces("Can you elaborate on *why* you think that?")).toEqual([
      { kind: "text", text: "Can you elaborate on " },
      { kind: "em", text: "why" },
      { kind: "text", text: " you think that?" },
    ]);
    expect(inlinePieces("**Key point:** use `NPV` and _then_ __decide__")).toEqual([
      { kind: "strong", text: "Key point:" },
      { kind: "text", text: " use " },
      { kind: "code", text: "NPV" },
      { kind: "text", text: " and " },
      { kind: "em", text: "then" },
      { kind: "text", text: " " },
      { kind: "strong", text: "decide" },
    ]);
  });

  it("leaves arithmetic, snake_case, lone asterisks and lists alone", () => {
    for (const text of ["3 * 4 * 5 = 60", "the file_name_here field", "rated 5* by users", "- first\n- second", "* a bullet"]) {
      expect(inlinePieces(text)).toEqual([{ kind: "text", text }]);
    }
  });

  it("keeps line breaks and makes heading lines bold", () => {
    expect(inlinePieces("## Next steps\nFirst, *ask*.\n\nThen act.")).toEqual([
      { kind: "strong", text: "Next steps" },
      { kind: "text", text: "\nFirst, " },
      { kind: "em", text: "ask" },
      { kind: "text", text: ".\n\nThen act." },
    ]);
  });

  it("never produces markup: tags stay text", () => {
    expect(inlinePieces("<b>hi</b> **<script>**")).toEqual([
      { kind: "text", text: "<b>hi</b> " },
      { kind: "strong", text: "<script>" },
    ]);
  });
});
