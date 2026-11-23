/**
 * A login ID worth showing a teacher, or null. Canvas gives users with no
 * login (its Student View test users) a long opaque hash instead, which
 * tells two "Test Student" rows apart for no one (Nathan, 2026-11-23). No
 * server imports: the Gradebook's client grid uses it.
 */
export function readableLoginId(id: string): string | null {
  const trimmed = id.trim();
  if (trimmed === "" || /^[0-9a-f]{20,}$/i.test(trimmed)) return null;
  return trimmed;
}
