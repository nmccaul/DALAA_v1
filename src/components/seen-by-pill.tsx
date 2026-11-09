/** Who reads a material, as the pill the Materials tab and the activity screens show (D-032). */
export type SeenBy = "students" | "ai" | "canvas";

const pill = "rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap";
const SEEN_BY: Record<SeenBy, { label: string; className: string }> = {
  students: { label: "Students + AI", className: `${pill} bg-accent-soft text-accent-text` },
  ai: { label: "AI only", className: `${pill} bg-warn-soft text-warn-text` },
  canvas: { label: "In Canvas", className: `${pill} border border-border-strong text-muted` },
};

export function SeenByPill({ seenBy }: { seenBy: SeenBy }) {
  return <span className={SEEN_BY[seenBy].className}>{SEEN_BY[seenBy].label}</span>;
}
