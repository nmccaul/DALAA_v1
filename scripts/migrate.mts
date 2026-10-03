/** `npm run migrate` — applies `db/migrations/` to DATABASE_URL. */

import postgres from "postgres";
import { databaseUrl } from "../src/db/url";
import { loadMigrations, migrate } from "../src/db/migrations";


const sql = postgres(databaseUrl(), { max: 1, prepare: false, onnotice: () => {} });
try {
  const applied = await migrate(
    {
      exec: async (text) => {
        await sql.unsafe(text);
      },
      query: async <T,>(text: string) => (await sql.unsafe(text)) as unknown as T[],
    },
    loadMigrations("db/migrations"),
  );
  for (const name of applied) console.log(`  applied  ${name}`);
  console.log(applied.length ? "migrations up to date" : "nothing to apply");
} finally {
  await sql.end();
}
