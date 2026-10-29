import { describe, expect, it } from "vitest";
import { dataUrlBytes, drawMarks, flatten, lineWidth, MARK_COLOR, undo, type Mark, type Sheet } from "./annotate";
import { SCREENSHOT_MAX_BYTES } from "./report";

/** A context that writes down what it was asked to draw. */
function fakeSheet(sizes: Record<number, number> = {}) {
  const calls: unknown[][] = [];
  const record = (name: string) => (...args: unknown[]) => void calls.push([name, ...args]);
  const pen = {
    strokeStyle: "" as unknown,
    lineWidth: 0,
    lineCap: "butt",
    lineJoin: "miter",
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    strokeRect: record("strokeRect"),
    drawImage: record("drawImage"),
  } as unknown as Sheet["pen"];
  const asked: number[] = [];
  const toJpeg = (quality: number) => {
    asked.push(quality);
    const bytes = sizes[quality] ?? 1000;
    return `data:image/jpeg;base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;
  };
  return { sheet: { pen, toJpeg }, calls, asked };
}

const circle: Mark = { tool: "pen", points: [{ x: 10, y: 10 }, { x: 20, y: 5 }, { x: 30, y: 10 }] };
const box: Mark = { tool: "rect", from: { x: 50, y: 40 }, to: { x: 20, y: 10 } };

describe("undo", () => {
  it("takes back the last mark only, and nothing from an empty list", () => {
    expect(undo([circle, box])).toEqual([circle]);
    expect(undo([circle])).toEqual([]);
    expect(undo([])).toEqual([]);
  });

  it("leaves the list it was given alone", () => {
    const marks = [circle, box];
    undo(marks);
    expect(marks).toHaveLength(2);
  });
});

describe("drawMarks", () => {
  it("draws pen lines through every point and rectangles from either corner, in red", () => {
    const { sheet, calls } = fakeSheet();
    drawMarks(sheet.pen, [circle, box], 4);
    expect(sheet.pen.strokeStyle).toBe(MARK_COLOR);
    expect(sheet.pen.lineWidth).toBe(4);
    expect(calls).toEqual([
      ["beginPath"],
      ["moveTo", 10, 10],
      ["lineTo", 20, 5],
      ["lineTo", 30, 10],
      ["stroke"],
      ["strokeRect", 20, 10, 30, 30],
    ]);
  });

  it("leaves a dot for a tap and skips an empty line", () => {
    const { sheet, calls } = fakeSheet();
    drawMarks(sheet.pen, [{ tool: "pen", points: [{ x: 3, y: 4 }] }, { tool: "pen", points: [] }], 4);
    expect(calls).toEqual([["beginPath"], ["moveTo", 3, 4], ["lineTo", 3, 4], ["stroke"]]);
  });
});

describe("lineWidth", () => {
  it("grows with the picture and never goes under 3", () => {
    expect(lineWidth(390, 800)).toBe(3);
    expect(lineWidth(1920, 3000)).toBe(10);
  });
});

describe("flatten", () => {
  it("draws the picture first, then the marks over it, and encodes once when it fits", () => {
    const { sheet, calls, asked } = fakeSheet();
    const image = {} as CanvasImageSource;
    const jpeg = flatten(sheet, image, 1200, 900, [box]);
    expect(calls[0]).toEqual(["drawImage", image, 0, 0, 1200, 900]);
    expect(calls[1]).toEqual(["strokeRect", 20, 10, 30, 30]);
    expect(sheet.pen.lineWidth).toBe(lineWidth(1200, 900));
    expect(asked).toEqual([0.8]);
    expect(jpeg?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("lowers the quality until it's under the cap", () => {
    const { sheet, asked } = fakeSheet({ 0.8: SCREENSHOT_MAX_BYTES + 1 });
    const jpeg = flatten(sheet, {} as CanvasImageSource, 100, 100, []);
    expect(asked).toEqual([0.8, 0.6]);
    expect(dataUrlBytes(jpeg!)).toBeLessThanOrEqual(SCREENSHOT_MAX_BYTES);
  });

  it("gives back NULL when it never fits", () => {
    const big = SCREENSHOT_MAX_BYTES + 1;
    const { sheet, asked } = fakeSheet({ 0.8: big, 0.6: big, 0.4: big });
    expect(flatten(sheet, {} as CanvasImageSource, 100, 100, [circle])).toBeNull();
    expect(asked).toEqual([0.8, 0.6, 0.4]);
  });
});
