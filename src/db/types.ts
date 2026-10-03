/**
 * The one query interface the app codes against. Production wraps postgres.js
 * (`client.ts`); tests wrap PGlite (`src/test/db.ts`). Parameters are always
 * `$1`-style placeholders — never string-built values.
 */
export interface Db {
  query<T>(text: string, values?: readonly unknown[]): Promise<T[]>;
}
