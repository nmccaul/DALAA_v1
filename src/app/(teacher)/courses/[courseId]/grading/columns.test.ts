import { describe, expect, it } from "vitest";
import { shownColumns } from "./columns";

const cols = [
  { id: "a", title: "First Offer" },
  { id: "b", title: "First Offer, again" },
  { id: "c", title: "Debate" },
];

describe("shownColumns", () => {
  it("shows only the picked assignment, even when another title contains its name", () => {
    expect(shownColumns(cols, "a", "").map((c) => c.id)).toEqual(["a"]);
    expect(shownColumns(cols, "a", "debate").map((c) => c.id)).toEqual(["a"]);
  });

  it("searches titles when nothing is picked, or the pick isn't a column", () => {
    expect(shownColumns(cols, null, " first ").map((c) => c.id)).toEqual(["a", "b"]);
    expect(shownColumns(cols, "gone", "").map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(shownColumns(cols, null, "zzz")).toEqual([]);
  });
});
