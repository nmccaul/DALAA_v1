import { describe, expect, it } from "vitest";
import { bands } from "./insights-charts";

describe("bands", () => {
  it("puts each score in its band, edges going up", () => {
    expect(bands([0, 0.59, 0.6, 0.79999, 0.8, 0.9, 1])).toEqual([2, 1, 1, 1, 2]);
    expect(bands([])).toEqual([0, 0, 0, 0, 0]);
  });
});
