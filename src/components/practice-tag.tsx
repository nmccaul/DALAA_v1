/** Marks anything from practice Canvas, so made-up data is never mistaken for real. */
export function PracticeTag() {
  return (
    <span className="rounded-control border border-border-strong px-1.5 py-0.5 text-xs font-medium text-muted">
      Practice
    </span>
  );
}
