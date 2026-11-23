import type { Priority } from "@/feedback/report";

/** Each priority's color (D-042), used wherever a priority shows. A plain module, not the client menu's, so server pages can read it: Urgent red, Soon amber, Can wait blue. */
export const PRIORITY_TONE: Record<Priority | "none", string> = {
  p0: "border-danger/40 bg-danger-soft text-danger",
  p1: "border-warn-text/30 bg-warn-soft text-warn-text",
  p2: "border-accent-text/30 bg-accent-soft text-accent-text",
  none: "border-dashed border-border-strong bg-surface text-muted",
};
