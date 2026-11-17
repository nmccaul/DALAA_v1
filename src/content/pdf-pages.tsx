"use client";

import { ArrowSquareOut } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Pages are drawn this wide (in CSS pixels, times the screen's density) and scaled down to fit. */
const DRAW_WIDTH = 900;

type State = { kind: "waiting" } | { kind: "drawing"; pages: number } | { kind: "done" } | { kind: "failed" };

/**
 * A reading's PDF as its pages, the way the teacher made it (layout, headings,
 * pictures), drawn in the page with pdf.js so it looks the same in every
 * browser and inside Canvas's frame. Nothing loads until the reading is on
 * screen. The text version is one click away (and is what a screen reader
 * reads); if the file can't be drawn, the text is shown instead.
 */
export function PdfPages({ src, name, text }: { src: string; name: string; text: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ kind: "waiting" });
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    const draw = async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`${response.status}`);
        const { getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(await response.arrayBuffer()));
        if (cancelled) return;
        setState({ kind: "drawing", pages: pdf.numPages });
        for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (DRAW_WIDTH / base.width) * Math.min(window.devicePixelRatio || 1, 2) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "block h-auto w-full rounded-control border border-border bg-white shadow-sm";
          canvas.setAttribute("aria-hidden", "true");
          await page.render({ canvas, viewport }).promise;
          if (!cancelled) pages.current?.append(canvas);
        }
        if (!cancelled) setState({ kind: "done" });
      } catch (error) {
        console.error("couldn't show the PDF:", error instanceof Error ? error.message : error);
        if (!cancelled) setState({ kind: "failed" });
      }
    };
    // Start once the reading is on screen: a student who goes straight to the chat never downloads it.
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        seen.disconnect();
        void draw();
      }
    });
    seen.observe(el);
    return () => {
      cancelled = true;
      seen.disconnect();
    };
  }, [src]);

  if (state.kind === "failed") return <>{text}</>;
  return (
    <div ref={box} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <button type="button" onClick={() => setShowText((s) => !s)} aria-expanded={showText} className="font-medium text-accent-text underline">
          {showText ? "Show the pages" : "Show as text"}
        </button>
        <a href={src} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-accent-text underline">
          Open the PDF <ArrowSquareOut size={14} aria-hidden />
        </a>
        {state.kind !== "done" && !showText && (
          <span className="text-muted" aria-live="polite">
            {state.kind === "drawing" ? `Loading ${state.pages} ${state.pages === 1 ? "page" : "pages"}…` : "Loading the pages…"}
          </span>
        )}
      </div>
      {showText && text}
      <div ref={pages} role="img" aria-label={`The pages of ${name}. Choose "Show as text" to read it as text.`} hidden={showText} className="flex flex-col gap-4" />
    </div>
  );
}
