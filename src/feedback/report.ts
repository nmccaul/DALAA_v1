/**
 * The shape of a feedback report as the browser sends it. Shared by the
 * button (src/components/feedback.tsx) and the intake (store.ts), so both
 * agree on the limits. Every captured string is scrubbed again on parse.
 */

import { z } from "zod";
import { scrub } from "./scrub";

/** Most recent entries kept per list, so a report stays small. */
export const RING_SIZE = 25;
export const NOTE_MAX = 2000;
/** Decoded screenshot size the server accepts (and the column allows). */
export const SCREENSHOT_MAX_BYTES = 3 * 1024 * 1024;

/** The kinds of report, in the order the button offers them, with what it calls each. */
export const KINDS = [
  { value: "bug", label: "Something's broken" },
  { value: "confusing", label: "Something's confusing" },
  { value: "idea", label: "An idea" },
] as const;

export type Kind = (typeof KINDS)[number]["value"];

export const kindLabel = (kind: Kind) => KINDS.find((k) => k.value === kind)!.label;

const scrubbed = (max: number) => z.string().transform((s) => scrub(s, max));
const ring = <T extends z.ZodType>(entry: T) => z.array(entry).transform((list) => list.slice(-RING_SIZE));

export const ReportContext = z.object({
  title: z.string().transform((s) => s.slice(0, 200)),
  userAgent: z.string().transform((s) => s.slice(0, 300)),
  viewport: z.object({ w: z.number().int().nonnegative(), h: z.number().int().nonnegative(), dpr: z.number().positive() }),
  colorScheme: z.enum(["light", "dark"]),
  console: ring(z.object({ t: z.number(), level: z.enum(["warn", "error"]), text: scrubbed(300) })),
  errors: ring(z.object({ t: z.number(), message: scrubbed(300), stack: scrubbed(2000).nullable() })),
});

export type ReportContext = z.infer<typeof ReportContext>;

export const ReportInput = z.object({
  clientKey: z.uuid(),
  kind: z.enum(KINDS.map((k) => k.value) as [Kind, ...Kind[]]),
  note: z.string().trim().min(1).max(NOTE_MAX),
  url: scrubbed(2000),
  context: ReportContext,
  /** A `data:image/png;base64,…` or jpeg data URL; NULL when left out. */
  screenshot: z.string().nullable(),
});

export type ReportInput = z.input<typeof ReportInput>;
