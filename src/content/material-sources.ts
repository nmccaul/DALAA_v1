/**
 * Where a material came from, what each source is called, and the "Show"
 * filters over them. No server imports, so the Materials tab and the
 * activity wizard's materials step (a client form) share one list.
 */

export type MaterialSource = "paste" | "upload" | "canvas-page" | "canvas-file" | "web";

/** What each source is called on the Materials tab. */
export const SOURCE_LABEL: Record<MaterialSource, string> = {
  paste: "Pasted",
  upload: "Uploaded",
  "canvas-page": "Canvas Page",
  "canvas-file": "Canvas File",
  web: "Web page",
};

/** The "Show" filters, in order; `null` is All. */
export const SOURCE_FILTERS: readonly { source: MaterialSource | null; label: string }[] = [
  { source: null, label: "All" },
  { source: "canvas-page", label: "Canvas Pages" },
  { source: "canvas-file", label: "Canvas Files" },
  { source: "upload", label: "Uploaded" },
  { source: "paste", label: "Pasted" },
  { source: "web", label: "Web pages" },
];
