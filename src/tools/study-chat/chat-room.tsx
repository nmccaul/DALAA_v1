"use client";

import { ArrowUp, Stop } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { inlinePieces } from "@/components/inline-format";
import { Button } from "@/components/ui";
import { DictationButton } from "./dictation";
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
  const [dictating, setDictating] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishing, startFinish] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const { maxTurns, minTurns, timeLimitMinutes, studentCanFinish } = view.limits;
  const left = minutesLeft(startedAt, timeLimitMinutes, now);
  const timeUp = left === 0;
  const over = ended ?? (timeUp ? ENDED.time : null);
  const busy = pending !== null && pending.failed === null;

  useEffect(() => {
    if (startedAt === null || timeLimitMinutes === null || ended) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [startedAt, timeLimitMinutes, ended]);

  // Time ran out with the page open: the chat ends here too, so the refresh
  // below has the server close it and grade it (feedback f945b103). Waits for
  // a reply on its way, which may end the chat itself, and a few seconds more:
  // this page's clock started a moment before the server's.
  useEffect(() => {
    if (!timeUp || ended !== null || busy) return;
    const wait = setTimeout(() => setEnded(ENDED.time), 5_000);
    return () => clearTimeout(wait);
  }, [timeUp, ended, busy]);

  // The chat ended here: fetch the page again so the grade (or "Being graded…") shows under it.
  useEffect(() => {
    if (ended !== null && initialEnded === null) router.refresh();
  }, [ended, initialEnded, router]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, pending?.reply, pending?.failed]);

  // The message box grows with what's in it, up to its max height, then scrolls.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

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
    if (message === "" || pending || over || dictating) return;
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
  const canSpeak = view.answerWith !== "typing";
  const placeholder =
    view.answerWith === "speaking"
      ? `Press the microphone and talk to ${view.persona.name}`
      : `Message ${view.persona.name}${canSpeak ? ", or press the microphone to talk" : ""}`;
  const canSend = pending === null && !dictating && draft.trim() !== "";

  return (
    <section aria-label="Chat" className="relative flex flex-col gap-5">
      {/* Progress sits apart from the chat (Nathan, 2026-11-17): in the margin beside it on a wide screen, above it
          otherwise. A finished chat is folded under the grade, so it has none. */}
      {!over && (
        <aside aria-label="Your progress" className="xl:absolute xl:inset-y-0 xl:left-full xl:ml-6 xl:w-56">
          <ProgressPanel
            messagesLeft={maxTurns === null ? null : Math.max(0, maxTurns - sent)}
            maxTurns={maxTurns}
            sent={turns.length}
            minTurns={minTurns}
            minutesLeft={left}
            timeLimitMinutes={timeLimitMinutes}
            progress={progress}
          />
        </aside>
      )}
      <header className="flex min-w-0 items-center gap-3 border-b border-border pb-4">
        <Avatar name={view.persona.name} />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-semibold">{view.persona.name}</p>
          <p className="truncate text-sm text-muted">{view.persona.role}</p>
        </div>
      </header>

      <div role="log" aria-live="polite" className="flex flex-col gap-6">
        <Bubble from={view.persona.name} text={view.opening} />
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-6">
            <Bubble mine text={t.message} />
            <Bubble from={view.persona.name} text={t.reply} />
          </div>
        ))}
        {pending && (
          <div className="flex flex-col gap-6">
            <Bubble mine text={pending.message} />
            {pending.failed === null ? (
              pending.reply ? (
                <Bubble from={view.persona.name} text={pending.reply} />
              ) : (
                <Typing name={view.persona.name} />
              )
            ) : (
              <div className="ml-11 flex flex-col items-start gap-2 rounded-2xl border border-danger/40 bg-danger-soft px-4 py-3">
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
        <p className="rounded-2xl bg-subtle px-5 py-4 text-center font-medium">{over}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-2 sm:sticky sm:bottom-3"
        >
          <div className="flex flex-col rounded-3xl border border-border-strong bg-surface shadow-md focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <label htmlFor="chat-message" className="sr-only">
              Your message to {view.persona.name}
            </label>
            <textarea
              ref={box}
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
              rows={1}
              placeholder={placeholder}
              className="max-h-60 min-h-12 resize-none bg-transparent px-5 pt-4 pb-1 leading-relaxed outline-none! placeholder:text-muted"
            />
            <div className="flex items-center justify-between gap-3 px-3 pb-3">
              <div className="min-w-0">
                {canSpeak && (
                  <DictationButton
                    activityId={activityId}
                    disabled={pending !== null}
                    onText={(text) => setDraft((d) => (d.trim() === "" ? text : `${d.trimEnd()} ${text}`).slice(0, MAX_MESSAGE_LENGTH))}
                    onBusy={setDictating}
                  />
                )}
              </div>
              <button
                type="submit"
                disabled={!canSend}
                aria-label={busy ? "Waiting for the reply" : "Send"}
                title={busy ? "Waiting for the reply" : "Send"}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:bg-border-strong"
              >
                {busy ? <Stop size={16} weight="fill" aria-hidden /> : <ArrowUp size={20} weight="bold" aria-hidden />}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 text-sm text-muted">
            <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
            <span className="flex flex-wrap items-center gap-2">
              {studentCanFinish && turns.length > 0 && turns.length < (minTurns ?? 1) && <span>You can finish after {minTurns} messages.</span>}
              {studentCanFinish && turns.length >= Math.max(1, minTurns ?? 1) && !confirming && (
                <button type="button" onClick={() => setConfirming(true)} disabled={pending !== null} className="underline hover:text-text disabled:opacity-50">
                  Finish the chat
                </button>
              )}
              {confirming && (
                <>
                  <span className="text-text">Finish now? You can&apos;t send more messages after this.</span>
                  <Button type="button" variant="secondary" onClick={finish} disabled={finishing}>
                    Finish chat
                  </Button>
                  <button type="button" onClick={() => setConfirming(false)} className="underline hover:text-text">
                    Keep chatting
                  </button>
                </>
              )}
            </span>
          </div>
          {finishError && <p className="px-2 text-sm text-danger">{finishError}</p>}
        </form>
      )}
    </section>
  );
}

/**
 * How far along the student is, each line naming what it counts (feedback
 * abf69c71): messages left (a maximum, so it counts down: Nathan,
 * 2026-11-13), time left, the minimum, and, when the teacher shows progress,
 * the key points made and the position taken. Only key points already made
 * are named; the rest stay a count, so the panel never gives answers away.
 */
function ProgressPanel({
  messagesLeft,
  maxTurns,
  sent,
  minTurns,
  minutesLeft: left,
  timeLimitMinutes,
  progress,
}: {
  messagesLeft: number | null;
  maxTurns: number | null;
  sent: number;
  minTurns: number | null;
  minutesLeft: number | null;
  timeLimitMinutes: number | null;
  progress: StudentProgress | null;
}) {
  const points = progress?.points ?? null;
  const minimumMet = minTurns !== null && sent >= minTurns;
  const stats = [
    messagesLeft !== null && maxTurns !== null && (
      <Stat
        key="messages"
        label="Messages left"
        value={messagesLeft}
        unit={`of ${maxTurns}`}
        share={maxTurns === 0 ? 0 : messagesLeft / maxTurns}
        low={messagesLeft <= 2}
        note={messagesLeft === 1 ? "Your next message is your last." : null}
      />
    ),
    timeLimitMinutes !== null && (
      <Stat
        key="time"
        label="Time left"
        value={left ?? timeLimitMinutes}
        unit="min"
        share={left === null ? 1 : left / timeLimitMinutes}
        low={left !== null && left <= 2}
        note={left === null ? "The clock starts with your first message." : null}
      />
    ),
    points && (
      <Stat
        key="points"
        label="Key points you've made"
        value={points.covered}
        unit={`of ${points.total}`}
        share={points.total === 0 ? 0 : points.covered / points.total}
        good
        wide
        note={points.covered === 0 ? "They show up here as you make them." : null}
      >
        {points.names.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {points.names.map((name) => (
              <li key={name} className="flex gap-1.5">
                <span aria-hidden className="text-success">✓</span>
                <span className="min-w-0 break-words">{name}</span>
              </li>
            ))}
          </ul>
        )}
      </Stat>
    ),
  ].filter(Boolean);

  if (stats.length === 0 && minTurns === null && !progress?.position) return null;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm xl:sticky xl:top-6">
      <h2 className="text-xs font-bold tracking-wide text-accent-text uppercase">Your progress</h2>
      {stats.length > 0 && <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] xl:grid-cols-1">{stats}</div>}
      {minTurns !== null && (
        <p className={`flex gap-1.5 text-sm ${minimumMet ? "font-medium text-success" : "text-muted"}`}>
          <span aria-hidden>{minimumMet ? "✓" : "○"}</span>
          <span>
            {minimumMet
              ? `Minimum reached: ${minTurns} ${minTurns === 1 ? "message" : "messages"}`
              : `Send at least ${minTurns} ${minTurns === 1 ? "message" : "messages"} before the chat can end (${sent} so far)`}
          </span>
        </p>
      )}
      {progress?.position && (
        <p className="text-sm">
          <span className="text-muted">Your position: </span>
          <span className="font-medium">{progress.position}</span>
        </p>
      )}
    </div>
  );
}

/** One counted thing: a big number, what it's out of, and a bar. `low` turns it to a warning; `good` fills toward done. */
function Stat({
  label,
  value,
  unit,
  share,
  low = false,
  good = false,
  wide = false,
  note,
  children,
}: {
  label: string;
  value: number;
  unit: string;
  share: number;
  low?: boolean;
  good?: boolean;
  /** Takes the whole row on a phone, for its list. */
  wide?: boolean;
  note?: string | null;
  children?: ReactNode;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, share)) * 100);
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <span className="text-sm text-muted">{label}</span>
      <span className={`flex items-baseline gap-1.5 ${low ? "text-danger" : ""}`}>
        <span className="text-3xl leading-none font-semibold tabular-nums">{value}</span>
        <span className="text-sm text-muted">{unit}</span>
      </span>
      <span
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${value} ${unit}`}
        className="h-2 overflow-hidden rounded-full bg-subtle"
      >
        <span
          className={`block h-full rounded-full transition-[width] ${low ? "bg-danger" : good ? "bg-success" : "bg-accent"}`}
          style={{ width: `${percent}%` }}
        />
      </span>
      {note && <span className={`text-sm ${low ? "text-danger" : "text-muted"}`}>{note}</span>}
      {children}
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
      <code key={i} className="rounded bg-subtle px-1 font-mono text-[0.9em]">{p.text}</code>
    ) : (
      p.text
    ),
  );
}

/** A round badge with the speaker's initials ("Jordan Leigh" → "JL"). */
function Avatar({ name }: { name: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "AI";
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-white">
      {initials}
    </span>
  );
}

/** Three dots while the character is writing, like any chat app. */
function Typing({ name }: { name: string }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar name={name} />
      <span className="sr-only">{name} is writing…</span>
      <span aria-hidden className="mt-1 flex gap-1 rounded-2xl bg-subtle px-4 py-3">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="size-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
    </div>
  );
}

/**
 * One message, chat-app style: the character's on the left beside its
 * initials, as open text; the student's own (`mine`) in a bubble on the
 * right, labeled with `from` when given (a teacher reading a transcript). The
 * AI's messages show its bold and italics; the student's show exactly what
 * they typed.
 */
export function Bubble({ text, from, mine = false }: { text: string; from?: string; mine?: boolean }) {
  if (mine) {
    return (
      <div className="flex flex-col items-end gap-1 pl-10">
        {from && <span className="px-1 text-xs text-muted">{from}</span>}
        <p className="max-w-[85%] rounded-3xl rounded-br-lg bg-accent-soft px-5 py-3 leading-relaxed whitespace-pre-wrap break-words">
          {text}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 pr-4 sm:pr-10">
      <Avatar name={from ?? ""} />
      <div className="flex min-w-0 flex-col gap-1">
        {from && <span className="text-sm font-semibold">{from}</span>}
        <p className="leading-relaxed whitespace-pre-wrap break-words">
          <Formatted text={text} />
        </p>
      </div>
    </div>
  );
}
