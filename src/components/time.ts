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
