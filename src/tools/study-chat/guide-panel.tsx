import Link from "next/link";

/** Where "Use a Canvas page or file" goes for a guide: the picker, saving it as AI-only, then back to `next`. */
export function canvasGuideHref(courseId: string, next: string, activityId?: string): string {
  const query = new URLSearchParams({ next, for: "guide" });
  if (activityId) query.set("activity", activityId);
  return `/courses/${courseId}/content/canvas?${query}`;
}

/**
 * The AI-only guide line, on create step 2 and on the review screen: the
 * guide's name and a way to remove it, or a folded way to add one (upload,
 * paste, or a Canvas page or file).
 */
export function GuidePanel({
  guide,
  remove,
  canvasHref,
  form,
}: {
  guide: { name: string } | null;
  remove: React.ReactNode;
  canvasHref: string;
  form: React.ReactNode;
}) {
  if (guide) {
    return (
      // A div: `remove` may be a form, which can't sit inside a <p>.
      <div className="text-muted">
        Guide only the AI reads: <span className="font-medium text-text">{guide.name}</span> {remove}
      </div>
    );
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted hover:text-text">Add a guide only the AI reads (answer key, teaching note)</summary>
      <div className="mt-3 flex flex-col gap-3 rounded-panel border border-border bg-surface p-4">
        <p className="text-muted">The AI uses it to steer the chat and to grade. Students never see it.</p>
        <Link href={canvasHref} className="self-start font-medium text-accent-text underline">
          Use a Canvas page or file
        </Link>
        {form}
      </div>
    </details>
  );
}
