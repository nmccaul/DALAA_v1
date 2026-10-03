/** Marks a screen that shows how something will work before it's built. */
export function PreviewNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-control border border-dashed border-border-strong/60 px-4 py-3 text-sm text-muted">
      <span className="mr-2 rounded-control bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent-text">Preview</span>
      {children}
    </p>
  );
}
