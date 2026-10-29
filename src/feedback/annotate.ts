/**
 * Marks a reporter draws over the screenshot before sending it: freehand pen
 * lines and rectangles, in the picture's own pixels so they land in the same
 * place whatever size the editor shows it at. Pure, so undo and flattening are
 * tested without a browser (annotate.test.ts); the editor is
 * src/components/annotate.tsx.
 */

import { SCREENSHOT_MAX_BYTES } from "./report";

export type Point = { x: number; y: number };

export type Mark = { tool: "pen"; points: Point[] } | { tool: "rect"; from: Point; to: Point };

export type Tool = Mark["tool"];

/** The ink: a red that reads on light and dark pages alike. */
export const MARK_COLOR = "#e5191b";

/** Line width in picture pixels, so a mark is as visible on a small capture as on a big one. */
export const lineWidth = (width: number, height: number) => Math.max(3, Math.round(Math.max(width, height) / 300));

/** The marks with the last one taken back. */
export const undo = (marks: readonly Mark[]): Mark[] => marks.slice(0, -1);

/** The part of a 2D canvas context drawing needs. */
export type Pen = Pick<
  CanvasRenderingContext2D,
  "beginPath" | "moveTo" | "lineTo" | "stroke" | "strokeRect" | "strokeStyle" | "lineWidth" | "lineCap" | "lineJoin"
>;

/** Draws the marks onto a context whose pixels are the picture's. */
export function drawMarks(pen: Pen, marks: readonly Mark[], width: number) {
  pen.strokeStyle = MARK_COLOR;
  pen.lineWidth = width;
  pen.lineCap = "round";
  pen.lineJoin = "round";
  for (const mark of marks) {
    if (mark.tool === "rect") {
      pen.strokeRect(Math.min(mark.from.x, mark.to.x), Math.min(mark.from.y, mark.to.y), Math.abs(mark.to.x - mark.from.x), Math.abs(mark.to.y - mark.from.y));
      continue;
    }
    const [first, ...rest] = mark.points;
    if (!first) continue;
    pen.beginPath();
    pen.moveTo(first.x, first.y);
    // A tap with no movement still leaves a dot.
    for (const p of rest.length ? rest : [first]) pen.lineTo(p.x, p.y);
    pen.stroke();
  }
}

/** Decoded size of a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

/** A canvas the picture and its marks are drawn on, then encoded. */
export type Sheet = {
  pen: Pen & Pick<CanvasRenderingContext2D, "drawImage">;
  toJpeg: (quality: number) => string;
};

/**
 * The picture with the marks drawn into it, as a JPEG under the server's cap;
 * NULL when even the lowest quality is too big (the caller keeps the
 * unmarked picture then).
 */
export function flatten(sheet: Sheet, image: CanvasImageSource, width: number, height: number, marks: readonly Mark[]): string | null {
  sheet.pen.drawImage(image, 0, 0, width, height);
  drawMarks(sheet.pen, marks, lineWidth(width, height));
  for (const quality of [0.8, 0.6, 0.4]) {
    const jpeg = sheet.toJpeg(quality);
    if (dataUrlBytes(jpeg) <= SCREENSHOT_MAX_BYTES) return jpeg;
  }
  return null;
}
