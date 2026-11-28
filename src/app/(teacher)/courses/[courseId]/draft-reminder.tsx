"use client";

import { X } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { REMINDER_COOKIE, reminderText, reminderValue, SNOOZE_MS } from "@/activities/draft-reminder";

/** "2 activities aren't finished. See them ›", with ✕ and "Remind me tomorrow" (feedback ecab5418, b0f7f57b). */
export function DraftReminder({ draftIds, href }: { draftIds: string[]; href: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const text = reminderText(draftIds.length);
  const hide = (until: number | "never") => {
    // A year: the value itself says when it ends.
    document.cookie = `${REMINDER_COOKIE}=${reminderValue(draftIds, until)}; path=/; max-age=31536000; samesite=lax`;
    setHidden(true);
  };
  return (
    <div role="status" className="flex items-start gap-3 rounded-control border border-border bg-accent-soft py-3 pr-2 pl-4">
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 break-words">{text.line}</span>
        <Link href={href} className="font-medium text-accent-text underline">
          {text.link} ›
        </Link>
        <button type="button" onClick={() => hide(Date.now() + SNOOZE_MS)} className="text-sm text-muted underline hover:text-text">
          Remind me tomorrow
        </button>
      </p>
      <button
        type="button"
        onClick={() => hide("never")}
        aria-label="Dismiss"
        title="Dismiss"
        className="grid size-8 shrink-0 place-items-center rounded-control text-muted hover:bg-subtle hover:text-text"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
