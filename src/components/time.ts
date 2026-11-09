/**
 * How times are written for people. The server can't know the viewer's time
 * zone, so pages render `<LocalTime>` (local-time.tsx), which formats in the
 * browser's zone; this is the one list of formats it uses.
 */
const FORMATS = {
  /** "Oct 29, 2026, 4:15 PM" */
  dateTime: { dateStyle: "medium", timeStyle: "short" },
  /** "Oct 29, 2026" */
  date: { dateStyle: "medium" },
  /** "Oct 29" */
  day: { month: "short", day: "numeric" },
  /** "4:15:09 PM" */
  clock: { timeStyle: "medium" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type TimeStyle = keyof typeof FORMATS;

/** `when` written in `style` for `timeZone` (an IANA name such as "America/Denver"). */
export function formatTime(when: Date | number, style: TimeStyle, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { ...FORMATS[style], timeZone }).format(when);
}

/** `when` as a `<input type="datetime-local">` value ("2027-02-01T23:59") in this machine's zone (the browser's, on a page). */
export function localInputValue(when: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}T${p(when.getHours())}:${p(when.getMinutes())}`;
}
