import { describe, expect, it } from "vitest";
import { parseRoster } from "./roster";

describe("parseRoster", () => {
  it("reads NetID, name, section without a header", () => {
    expect(parseRoster("jdoe, Jane Doe, 001\nasmith,Al Smith").rows).toEqual([
      { netId: "jdoe", name: "Jane Doe", section: "001" },
      { netId: "asmith", name: "Al Smith", section: null },
    ]);
  });

  it("uses a header row to find columns in any order (tabs from a spreadsheet)", () => {
    const pasted = "Student Name\tSection\tNet ID\nJane Doe\t002\tJDoe\n";
    expect(parseRoster(pasted)).toEqual({
      rows: [{ netId: "jdoe", name: "Jane Doe", section: "002" }],
      problems: [],
    });
  });

  it("accepts a bare list of NetIDs and skips blank lines", () => {
    expect(parseRoster("jdoe\n\n  asmith  \n").rows.map((r) => r.netId)).toEqual(["jdoe", "asmith"]);
  });

  it("strips quotes from CSV cells", () => {
    expect(parseRoster('"jdoe","Jane Doe","001"').rows[0]).toEqual({
      netId: "jdoe",
      name: "Jane Doe",
      section: "001",
    });
  });

  it("reports lines without a NetID and duplicates, with line numbers", () => {
    const { rows, problems } = parseRoster("jdoe,Jane\n,Nobody\nJDOE,Jane again\nbad id,X");
    expect(rows.map((r) => r.netId)).toEqual(["jdoe"]);
    expect(problems).toEqual([
      { line: 2, text: ",Nobody", reason: "No NetID on this line" },
      { line: 3, text: "JDOE,Jane again", reason: "jdoe is already on line 1" },
      { line: 4, text: "bad id,X", reason: '"bad id" isn\'t a NetID' },
    ]);
  });
});
