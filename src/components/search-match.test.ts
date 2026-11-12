import { describe, expect, it } from "vitest";
import { matchesSearch } from "./search-match";

describe("matchesSearch", () => {
  it("matches everything when the query is blank", () => {
    expect(matchesSearch("", "Second store")).toBe(true);
    expect(matchesSearch("   ", "Second store")).toBe(true);
  });

  it("needs every word, in any order, ignoring case and accents", () => {
    expect(matchesSearch("STORE second", "Second store chat")).toBe(true);
    expect(matchesSearch("second bike", "Second store chat")).toBe(false);
    expect(matchesSearch("cafe", "Café case")).toBe(true);
    expect(matchesSearch("stor", "Second store")).toBe(true);
  });
});
