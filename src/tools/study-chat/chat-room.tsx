"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { inlinePieces } from "@/components/inline-format";
import { Button, inputStyles } from "@/components/ui";
import type { Exchange } from "./prompt";
import { finishChatAction } from "./student-actions";
import { ENDED, REPLY_FAILED } from "./student-messages";
import { MAX_MESSAGE_LENGTH, type StudentChatView, type StudentProgress } from "./student-view";
import { readTurnEvents } from "./turn-stream";

/** The message waiting for its reply. `key` is reused when it's sent again, so a retry never counts twice. */
type Pending = { key: string; message: string; reply: string; failed: string | null };

const ENDINGS: readonly string[] = Object.values(ENDED);

/** Minutes left, rounded up; NULL when there's no time limit or the chat hasn't started. */
function minutesLeft(startedAt: string | null, limit: number | null, now: number): number | null {
  if (startedAt === null || limit === null) return null;
  return Math.min(limit, Math.max(0, Math.ceil((Date.parse(startedAt) + limit * 60_000 - now) / 60_000)));
}

export function ChatRoom({
  activityId,
  view,
  initialTurns,
  startedAt: initialStart,
  ended: initialEnded,
  progress: initialProgress,
}: {
  activityId: string;
  view: StudentChatView;
  initialTurns: Exchange[];
  /** ISO time of the first message; NULL before it. */
  startedAt: string | null;
  /** Why the chat is over; NULL while it goes on. */
  ended: string | null;
  /** The progress meter; NULL unless the teacher shows it. */
  progress: StudentProgress | null;
}) {
  const [turns, setTurns] = useState(initialTurns);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState("");
  const [ended, setEnded] = useState(initialEnded);
  const [startedAt, setStartedAt] = useState(initialStart);
  const [progress, setProgress] = useState(initialProgress);
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishing, startFinish] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { maxTurns, timeLimitMinutes, studentCanFinish } = view.limits;
  const left = minutesLeft(startedAt, timeLimitMinutes, now);
  const timeUp = left === 0;
  const over = ended ?? (timeUp ? ENDED.time : null);
  const busy = pending !== null && pending.failed === null;

  useEffect(() => {
    if (startedAt === null || timeLimitMinutes === null || ended) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [startedAt, timeLimitMinutes, ended]);

  // The chat ended here: fetch the page again so the grade (or "Being graded…") shows under it.
  useEffect(() => {
    if (ended !== null && initialEnded === null) router.refresh();
  }, [ended, initialEnded, router]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, pending?.reply, pending?.failed]);

  async function send(key: string, message: string) {
    setPending({ key, message, reply: "", failed: null });
    setNow(Date.now());
    setStartedAt((s) => s ?? new Date().toISOString());
    let res: Response;
    try {
      res = await fetch(`/api/study-chat/${activityId}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientKey: key, message }),
      });
    } catch {
      setPending({ key, message, reply: "", failed: REPLY_FAILED });
      return;
    }
    if (!res.ok || !res.body) {
      const { reason } = (await res.json().catch(() => ({}))) as { reason?: string };
      if (reason && ENDINGS.includes(reason)) {
        setPending(null);
        setDraft(message);
        setEnded(reason);
      } else {
        setPending({ key, message, reply: "", failed: reason ?? REPLY_FAILED });
      }
      return;
    }
    let reply = "";
    let settled = false;
    try {
      for await (const event of readTurnEvents(res.body)) {
        if (event.type === "text") {
          reply += event.text;
          setPending({ key, message, reply, failed: null });
        } else if (event.type === "reply") {
          settled = true;
          setTurns((t) => [...t, { message, reply: event.reply }]);
          setPending(null);
          if (event.progress) setProgress(event.progress);
          if (event.ended) setEnded(event.ended);
        } else {
          settled = true;
          setPending({ key, message, reply: "", failed: event.reason });
        }
      }
    } catch {
      // The connection dropped mid-reply; handled below.
    }
    // The answer never came (the connection dropped, or the server stopped):
    // offer to send again rather than wait forever (feedback ed9b0fac). Sending
    // again uses the same key, so a reply that was saved comes back without
    // counting twice.
    if (!settled) setPending({ key, message, reply: "", failed: REPLY_FAILED });
  }

  function submit() {
    const message = draft.trim();
    if (message === "" || pending || over) return;
    setDraft("");
    void send(crypto.randomUUID(), message);
  }

  function finish() {
    setFinishError(null);
    startFinish(async () => {
      const result = await finishChatAction(activityId);
      if ("error" in result) setFinishError(result.error);
      else setEnded(result.ended);
      setConfirming(false);
    });
  }

  const sent = turns.length + (busy ? 1 : 0);

  return (
    <section aria-label="Chat" className="flex flex-col gap-4">
      {/* How far along the student is, each meter naming what it counts (feedback abf69c71). */}
      <div className="z-10 flex flex-col gap-3 rounded-panel border border-border bg-surface px-4 py-3 text-sm shadow-sm sm:sticky sm:top-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {/* The message limit is a maximum, so it counts down to the end of the chat (Nathan, 2026-11-13). */}
          {maxTurns !== null && (
            <Meter label="Messages left before the chat ends" value={Math.max(0, maxTurns - sent)} of={maxTurns} />
          )}
          {progress?.points && <Meter label="Key points you've made" value={progress.points.covered} of={progress.points.total} />}
        </div>
        {timeLimitMinutes !== null && !over && (
          <p className="text-muted">
            {left === null
              ? `Time limit: ${timeLimitMinutes} minutes, starting with your first message`
              : `Time left: ${left} ${left === 1 ? "minute" : "minutes"}`}
          </p>
        )}
        {progress?.points && progress.points.names.length > 0 && (
          <ul aria-label="Key points you've made" className="flex flex-wrap gap-1.5">
            {progress.points.names.map((name) => (
              <li key={name} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] text-accent-text">
                ✓ {name}
              </li>
            ))}
          </ul>
        )}
        {progress?.position && <p>Your position: <span className="font-medium">{progress.position}</span></p>}
      </div>

      <div role="log" aria-live="polite" className="flex flex-col gap-3">
        <Bubble from={view.persona.name} text={view.opening} />
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Bubble mine text={t.message} />
            <Bubble from={view.persona.name} text={t.reply} />
          </div>
        ))}
        {pending && (
          <div className="flex flex-col gap-3">
            <Bubble mine text={pending.message} />
            {pending.failed === null ? (
              <Bubble from={view.persona.name} text={pending.reply || "…"} />
            ) : (
              <div className="flex flex-col items-start gap-2 rounded-panel border border-danger/40 bg-danger-soft px-4 py-3">
                <p className="text-sm">{pending.failed}</p>
                <Button variant="secondary" onClick={() => void send(pending.key, pending.message)}>
                  Send again
                </Button>
              </div>
            )}
          </div>
        )}
        <div ref={end} />
      </div>

      {over ? (
        <p className="rounded-panel border border-border bg-surface px-4 py-3 font-medium">{over}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-2">
          <label htmlFor="chat-message" className="sr-only">
            Your message
          </label>
          <textarea
            id="chat-message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={3}
            placeholder={`Write to ${view.persona.name}…`}
            className={`${inputStyles} resize-y`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending !== null || draft.trim() === ""}>
              {busy ? "Waiting for the reply…" : "Send"}
            </Button>
            {studentCanFinish && turns.length > 0 && !confirming && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={pending !== null}
                className="text-sm text-muted underline hover:text-text disabled:opacity-50"
              >
                Finish
              </button>
            )}
            {confirming && (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span>Finish now? You can&apos;t send more messages after this.</span>
                <Button type="button" variant="secondary" onClick={finish} disabled={finishing}>
                  Finish chat
                </Button>
                <button type="button" onClick={() => setConfirming(false)} className="text-muted underline hover:text-text">
                  Keep chatting
                </button>
              </span>
            )}
          </div>
          {finishError && <p className="text-sm text-danger">{finishError}</p>}
        </form>
      )}
    </section>
  );
}

/** A labelled bar: "Messages left before the chat ends — 4 of 6". */
function Meter({ label, value, of }: { label: string; value: number; of: number }) {
  const percent = of === 0 ? 0 : Math.round((value / of) * 100);
  return (
    <div className="flex flex-col gap-1">
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <span className="text-muted tabular-nums">
          {value} of {of}
        </span>
      </span>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={of} aria-valuenow={value} className="h-2 overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** The AI's emphasis as elements (inline-format.ts); never HTML. */
function Formatted({ text }: { text: string }) {
  return inlinePieces(text).map((p, i) =>
    p.kind === "strong" ? (
      <strong key={i} className="font-semibold">{p.text}</strong>
    ) : p.kind === "em" ? (
      <em key={i}>{p.text}</em>
    ) : p.kind === "code" ? (
      <code key={i} className="rounded bg-bg px-1 font-mono text-[0.9em]">{p.text}</code>
    ) : (
      p.text
    ),
  );
}

/**
 * One message; the student's own (`mine`) sits on the right, labeled `from` or
 * "You". The AI's messages show its bold and italics; the student's show
 * exactly what they typed.
 */
export function Bubble({ text, from, mine = false }: { text: string; from?: string; mine?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
      <span className="text-xs text-muted">{from ?? (mine ? "You" : "")}</span>
      <p
        className={`max-w-[85%] rounded-panel px-4 py-2 leading-relaxed whitespace-pre-wrap break-words ${
          mine ? "bg-accent text-white" : "border border-border bg-surface"
        }`}
      >
        {mine ? text : <Formatted text={text} />}
      </p>
    </div>
  );
}
