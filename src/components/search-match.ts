/** Folds case and accents, so "cafe" finds "Café". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Whether `text` has every word of `query`, in any order. An empty query matches everything. */
export function matchesSearch(query: string, text: string): boolean {
  const haystack = fold(text);
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
