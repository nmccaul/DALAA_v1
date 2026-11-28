/**
 * Which Gradebook columns show (feedback e76cb618): one picked assignment
 * (`?assignment=`, from clicking its title) shows only its column, whatever
 * the search says; otherwise the assignment search narrows by title.
 */
export function shownColumns<C extends { id: string; title: string }>(columns: C[], picked: string | null, search: string): C[] {
  const one = picked ? columns.find((c) => c.id === picked) : undefined;
  if (one) return [one];
  const q = search.trim().toLowerCase();
  return columns.filter((c) => !q || c.title.toLowerCase().includes(q));
}
