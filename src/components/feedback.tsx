"use client";

import { ChatCircleDots } from "@phosphor-icons/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { dataUrlBytes } from "@/feedback/annotate";
import { KINDS, NOTE_MAX, SCREENSHOT_MAX_BYTES, type Kind, type ReportInput } from "@/feedback/report";
import { installRing } from "@/feedback/ring";
import { ScreenshotEditor } from "./annotate";
import { Button, inputStyles } from "./ui";

// Start remembering console warnings and errors as soon as any signed-in page loads.
const recent = typeof window === "undefined" ? null : installRing(window);

/**
 * A JPEG of the page as the person sees it, without this panel, small enough
 * for the server to keep; NULL when it can't be taken. The library loads only
 * when someone opens the panel.
 */
async function capturePage(): Promise<string | null> {
  try {
    const { domToJpeg } = await import("modern-screenshot");
    const skip = (node: Node) => !(node instanceof HTMLElement && node.dataset.feedback !== undefined);
    const base = { filter: skip, backgroundColor: getComputedStyle(document.body).backgroundColor };
    for (const [scale, quality] of [[Math.min(window.devicePixelRatio, 1.5), 0.75], [0.75, 0.6], [0.5, 0.5]]) {
      const shot = await domToJpeg(document.body, { ...base, scale, quality });
      if (dataUrlBytes(shot) <= SCREENSHOT_MAX_BYTES) return shot;
    }
    return null;
  } catch (error) {
    console.warn("Feedback: couldn't take a picture of the page", error);
    return null;
  }
}

/**
 * The feedback button in every signed-in shell: a note, what kind it is, and
 * (unless left out) a picture of the page, with the page's address and its
 * recent console warnings and errors. Sent to POST /api/feedback. The picture
 * can be marked up first. Cmd/Ctrl+Shift+F or an `open-feedback` window event
 * opens it from anywhere.
 */
export function FeedbackButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const capture = useRef<Promise<string | null> | null>(null);
  const [clientKey, setClientKey] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("bug");
  const [note, setNote] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [includeShot, setIncludeShot] = useState(true);
  const [marking, setMarking] = useState(false);
  const [annotated, setAnnotated] = useState(false);
  const [status, setStatus] = useState<"editing" | "sending" | "sent">("editing");
  const [problem, setProblem] = useState<string | null>(null);

  // Begin the picture on pointerdown, before the panel covers the page.
  function prime() {
    if (capture.current) return;
    setCapturing(true);
    const taking: Promise<string | null> = capturePage().then((s) => {
      if (capture.current === taking) {
        setShot(s);
        setCapturing(false);
      }
      return s;
    });
    capture.current = taking;
  }

  function open() {
    if (dialog.current?.open) return;
    prime();
    setClientKey((key) => key ?? crypto.randomUUID());
    setStatus("editing");
    setProblem(null);
    dialog.current?.showModal();
  }

  const openFromAnywhere = useEffectEvent(open);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openFromAnywhere();
      }
    };
    const asked = () => openFromAnywhere();
    window.addEventListener("keydown", key);
    window.addEventListener("open-feedback", asked);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("open-feedback", asked);
    };
  }, []);

  // The marked-up picture replaces the one that will be sent.
  function marked(jpeg: string | null) {
    setMarking(false);
    if (!jpeg) return;
    capture.current = Promise.resolve(jpeg);
    setShot(jpeg);
    setAnnotated(true);
  }

  // Closing (Cancel, Esc or Close) drops the picture so the next one shows the page as it is then.
  // A sent report starts the next one fresh; an unsent one keeps its note and key.
  function closed() {
    capture.current = null;
    setShot(null);
    setCapturing(false);
    setAnnotated(false);
    if (status !== "sent") return;
    setClientKey(null);
    setKind("bug");
    setNote("");
    setIncludeShot(true);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!clientKey || status === "sending") return;
    setStatus("sending");
    setProblem(null);
    const screenshot = includeShot ? await capture.current : null;
    const report: ReportInput = {
      clientKey,
      kind,
      note,
      url: location.href,
      screenshot: screenshot ?? null,
      context: {
        title: document.title,
        userAgent: navigator.userAgent,
        viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
        colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
        ...(screenshot && annotated ? { annotated: true } : {}),
        ...(recent?.() ?? { console: [], errors: [] }),
      },
    };
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { reason?: string } | null;
        throw new Error(body?.reason ?? "That didn't send. Try again.");
      }
      setStatus("sent");
    } catch (error) {
      setStatus("editing");
      setProblem(error instanceof TypeError ? "That didn't send. Check your connection and try again." : (error as Error).message);
    }
  }

  return (
    <div data-feedback="">
      <button
        type="button"
        onPointerDown={prime}
        onClick={open}
        className="fixed right-4 bottom-4 z-30 inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text shadow-lg hover:bg-accent-soft print:hidden"
      >
        <ChatCircleDots size={18} weight="duotone" aria-hidden />
        Feedback
      </button>
      <dialog
        ref={dialog}
        onClose={closed}
        aria-labelledby="feedback-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-panel border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/40"
      >
        {status === "sent" ? (
          <div className="flex flex-col gap-4 p-6">
            <h2 id="feedback-title" className="font-display text-xl font-semibold">
              Thanks, we got it
            </h2>
            <p className="text-muted">Your note{includeShot && shot ? " and the picture of the page" : ""} went to the DALAA team.</p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => dialog.current?.close()}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-4 p-6">
            <h2 id="feedback-title" className="font-display text-xl font-semibold">
              Tell us what happened
            </h2>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">What kind of feedback</legend>
              {KINDS.map((k) => (
                <label
                  key={k.value}
                  className={`cursor-pointer rounded-control border px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                    kind === k.value ? "border-accent bg-accent-soft text-accent-text" : "border-border-strong text-muted hover:text-text"
                  }`}
                >
                  <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                  {k.label}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-sm font-medium">
              What were you doing, and what went wrong?
              <textarea
                required
                rows={4}
                maxLength={NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={`${inputStyles} font-normal`}
              />
            </label>
            <div className="flex items-start gap-3">
              <label className="flex flex-1 items-center gap-2 text-sm">
                <input type="checkbox" checked={includeShot} onChange={(e) => setIncludeShot(e.target.checked)} />
                Include a picture of this page
              </label>
              {includeShot &&
                (shot ? (
                  <button type="button" onClick={() => setMarking(true)} className="flex flex-col items-center gap-1 text-xs text-accent-text hover:underline">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing to optimize */}
                    <img src={shot} alt="The picture that will be sent" className="h-16 w-auto max-w-32 rounded-control border border-border object-cover object-top" />
                    {annotated ? "Marked up · add more" : "Mark it up"}
                  </button>
                ) : (
                  <span className="text-sm text-muted">{capturing ? "Taking picture…" : "No picture"}</span>
                ))}
            </div>
            {problem && (
              <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
                {problem}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
                Cancel
              </Button>
              <Button type="submit" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        )}
      </dialog>
      {marking && shot && <ScreenshotEditor src={shot} onDone={marked} onCancel={() => setMarking(false)} />}
    </div>
  );
}
