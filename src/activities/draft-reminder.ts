/**
 * The Activities tab's "You're still setting up …" reminder can be put away
 * (Lucy, feedback ecab5418): ✕ hides it for that draft; "Remind me tomorrow"
 * hides it for a day. The choice is one cookie the server reads, so a hidden
 * reminder never flashes on load. A different draft brings it back. No
 * server imports: the reminder's client button writes the cookie.
 */

export const REMINDER_COOKIE = "dalaa_draft_reminder";

/** A day, for "Remind me tomorrow". */
export const SNOOZE_MS = 24 * 60 * 60 * 1000;

/** The cookie's value: the draft, and until when (`never` for ✕). */
export function reminderValue(draftId: string, until: number | "never"): string {
  return `${draftId}.${until}`;
}

/** Whether the reminder for `draftId` stays hidden at `now`, given the cookie's value. */
export function reminderHidden(value: string | undefined, draftId: string, now = Date.now()): boolean {
  if (!value) return false;
  const [id, until] = value.split(".");
  if (id !== draftId) return false;
  if (until === "never") return true;
  const time = Number(until);
  return Number.isFinite(time) && time > now;
}
