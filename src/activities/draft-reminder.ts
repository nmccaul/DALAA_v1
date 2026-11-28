/**
 * The Activities tab's one "activities aren't finished" line (Lucy, feedback
 * ecab5418, b0f7f57b). It shows on Assigned only: Not assigned already lists
 * the drafts. ✕ hides it until a new draft appears; "Remind me tomorrow"
 * hides it for a day. The choice is one cookie the server reads, so a hidden
 * line never flashes on load. No server imports: the line's client buttons
 * write the cookie.
 */

export const REMINDER_COOKIE = "dalaa_draft_reminder";

/** A day, for "Remind me tomorrow". */
export const SNOOZE_MS = 24 * 60 * 60 * 1000;

/** The cookie's value: until when (`never` for ✕), then the drafts it was hidden for. */
export function reminderValue(draftIds: readonly string[], until: number | "never"): string {
  return [until, ...draftIds].join(".");
}

/** Whether the line stays hidden at `now` for these drafts, given the cookie's value: a draft it wasn't hidden for brings it back. */
export function reminderHidden(value: string | undefined, draftIds: readonly string[], now = Date.now()): boolean {
  if (!value) return false;
  const [until, ...seen] = value.split(".");
  if (!draftIds.every((id) => seen.includes(id))) return false;
  if (until === "never") return true;
  const time = Number(until);
  return Number.isFinite(time) && time > now;
}

/** Whether the Activities tab shows the line: on its Assigned view only. */
export function showsReminder(view: string, draftIds: readonly string[], cookie: string | undefined, now = Date.now()): boolean {
  return view === "assigned" && draftIds.length > 0 && !reminderHidden(cookie, draftIds, now);
}

/** "2 activities aren't finished." and the link's words. */
export function reminderText(count: number): { line: string; link: string } {
  return count === 1
    ? { line: "1 activity isn't finished.", link: "See it" }
    : { line: `${count} activities aren't finished.`, link: "See them" };
}
