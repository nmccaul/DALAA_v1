import { describe, expect, it } from "vitest";
import { MODE_SLUGS } from "../modes";
import { groupOf, TYPE_GROUPS } from "./types";

describe("activity type groups", () => {
  it("put every mode in exactly one group, with unique keys", () => {
    const listed = TYPE_GROUPS.flatMap((g) => g.modes);
    expect([...listed].sort()).toEqual([...MODE_SLUGS].sort());
    expect(new Set(TYPE_GROUPS.map((g) => g.key)).size).toBe(TYPE_GROUPS.length);
    for (const mode of MODE_SLUGS) expect(groupOf(mode).modes).toContain(mode);
  });
});
