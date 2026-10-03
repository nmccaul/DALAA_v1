/**
 * Where the database is. DATABASE_URL wins (any Postgres, D-007); otherwise
 * the POSTGRES_URL that Vercel's Supabase integration sets (pooled, port 6543).
 * The app and the scripts all read it from here.
 */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("Set DATABASE_URL (or connect a database in Vercel, which sets POSTGRES_URL)");
  return url;
}
