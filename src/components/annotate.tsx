"use client";

import { ArrowCounterClockwise, PencilSimple, Square } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { drawMarks, flatten, lineWidth, undo, type Mark, type Point, type Tool } from "@/feedback/annotate";
import { Button } from "./ui";

const TOOLS: { value: Tool; label: string; Icon: typeof PencilSimple }[] = [
  { value: "pen", label: "Draw", Icon: PencilSimple },
  { value: "rect", label: "Box", Icon: Square },
];

/**
 * A full-screen editor over the feedback screenshot: draw or box what's wrong,
 * undo, clear. Done hands back the picture with the marks drawn in (NULL when
 * nothing was drawn, or it wouldn't fit under the size cap); Cancel and Escape
 * hand back nothing. Its own modal dialog, so it sits over the feedback panel
 * and Escape closes only this.
 */
export function ScreenshotEditor({ src, onDone, onCancel }: { src: string; onDone: (jpeg: string | null) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [drawing, setDrawing] = useState<Mark | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);

  // Redraw the picture and every mark whenever they change.
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !image) return;
    ctx.drawImage(image, 0, 0);
    drawMarks(ctx, drawing ? [...marks, drawing] : marks, lineWidth(image.naturalWidth, image.naturalHeight));
  }, [image, marks, drawing]);

  // Pointer position in the picture's own pixels, whatever size it's shown at.
  function at(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * event.currentTarget.width,
      y: ((event.clientY - box.top) / box.height) * event.currentTarget.height,
    };
  }

  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = at(event);
    setDrawing(tool === "pen" ? { tool, points: [p] } : { tool, from: p, to: p });
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const p = at(event);
    setDrawing(drawing.tool === "pen" ? { ...drawing, points: [...drawing.points, p] } : { ...drawing, to: p });
  }

  function up() {
    if (!drawing) return;
    setMarks([...marks, drawing]);
    setDrawing(null);
  }

  function done() {
    if (!image || marks.length === 0) return onDone(null);
    const sheet = document.createElement("canvas");
    sheet.width = image.naturalWidth;
    sheet.height = image.naturalHeight;
    const pen = sheet.getContext("2d");
    if (!pen) return onDone(null);
    onDone(flatten({ pen, toJpeg: (q) => sheet.toDataURL("image/jpeg", q) }, image, sheet.width, sheet.height, marks));
  }

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-label="Mark up the picture"
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-bg p-0 text-text backdrop:bg-black/60"
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-3">
          <p className="mr-auto text-sm text-muted">Circle or box what&apos;s wrong.</p>
          <div role="group" aria-label="Tool" className="flex gap-1">
            {TOOLS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={tool === value}
                onClick={() => setTool(value)}
                className={`inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-sm ${
                  tool === value ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong text-muted hover:text-text"
                }`}
              >
                <Icon size={16} aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMarks(undo(marks))}
            disabled={marks.length === 0}
            className="inline-flex items-center gap-1.5 rounded-control border border-border-strong px-3 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50"
          >
            <ArrowCounterClockwise size={16} aria-hidden />
            Undo
          </button>
          <button
            type="button"
            onClick={() => setMarks([])}
            disabled={marks.length === 0}
            className="rounded-control border border-border-strong px-3 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50"
          >
            Clear
          </button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={done}>
            Done
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          {image ? (
            <canvas
              ref={canvas}
              width={image.naturalWidth}
              height={image.naturalHeight}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              className="max-h-full max-w-full cursor-crosshair touch-none rounded-control border border-border shadow-lg"
            />
          ) : (
            <p className="text-sm text-muted">Loading the picture…</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
