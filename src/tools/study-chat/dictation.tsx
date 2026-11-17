"use client";

import { Microphone, Stop } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

/** The longest recording one message takes; it stops itself here (the server refuses much past it). */
export const MAX_RECORDING_SECONDS = 120;

type State = { kind: "idle" } | { kind: "recording"; seconds: number } | { kind: "transcribing" };

/** The first recording format this browser can make that the transcriber reads (Chrome: webm, Safari: mp4). */
function recordingType(): string | undefined {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * The student's microphone button (D-038): press, talk, press again, and what
 * they said is added to their message for them to check before sending. The
 * recording goes to the server once and isn't kept.
 */
export function DictationButton({
  activityId,
  disabled,
  onText,
  onBusy,
}: {
  activityId: string;
  disabled: boolean;
  onText: (text: string) => void;
  /** True while it's listening or writing it out, so the page holds Send until the words are in. */
  onBusy: (busy: boolean) => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => onBusy(state.kind !== "idle"), [state.kind, onBusy]);

  // Leaving the page stops the microphone and any upload.
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      abort.current?.abort();
    },
    [],
  );

  async function send(audio: Blob) {
    setState({ kind: "transcribing" });
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch(`/api/study-chat/${activityId}/dictate`, {
        method: "POST",
        headers: { "content-type": audio.type || "application/octet-stream" },
        body: audio,
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => ({}))) as { text?: string; reason?: string };
      if (response.ok && body.text) onText(body.text);
      else setError(body.reason ?? "We couldn't turn that into text. Try again, or type it.");
    } catch {
      if (!controller.signal.aborted) setError("The connection dropped. Try again.");
    } finally {
      if (!controller.signal.aborted) setState({ kind: "idle" });
    }
  }

  async function start() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record here. Type your message instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Allow the microphone for this page in your browser, then press the microphone again.");
      return;
    }
    const type = recordingType();
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
      recorder.current = null;
      void send(new Blob(chunks, { type: rec.mimeType || type }));
    };
    recorder.current = rec;
    rec.start();
    setState({ kind: "recording", seconds: 0 });
    let seconds = 0;
    timer.current = setInterval(() => {
      seconds += 1;
      if (seconds >= MAX_RECORDING_SECONDS && rec.state === "recording") rec.stop();
      else setState({ kind: "recording", seconds });
    }, 1000);
  }

  const recording = state.kind === "recording";
  const clock = recording ? `${Math.floor(state.seconds / 60)}:${String(state.seconds % 60).padStart(2, "0")}` : "";
  const label = recording ? "Stop and write it out" : state.kind === "transcribing" ? "Writing it out…" : "Talk instead of typing";
  return (
    <span className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={() => (recording ? recorder.current?.stop() : void start())}
        disabled={(disabled && !recording) || state.kind === "transcribing"}
        aria-pressed={recording}
        aria-label={label}
        title={label}
        className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-50 ${
          recording ? "bg-danger text-white" : "text-accent-text hover:bg-subtle"
        }`}
      >
        {recording ? <Stop size={16} weight="fill" aria-hidden /> : <Microphone size={20} aria-hidden />}
      </button>
      {recording && (
        <span className="flex items-center gap-1.5 text-sm text-muted" aria-live="polite">
          <span className="inline-block size-2 animate-pulse rounded-full bg-danger" aria-hidden />
          <span className="tabular-nums">{clock}</span>
          <span className="hidden sm:inline">Listening. Press stop when you&apos;re done.</span>
        </span>
      )}
      {state.kind === "transcribing" && (
        <span className="text-sm text-muted" aria-live="polite">
          Writing it out…
        </span>
      )}
      {error && (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
