import { db } from "@/db/client";

/** Uptime check for Vercel or a BYU server: is the app up, can it reach Postgres? */
export async function GET() {
  try {
    await db().query("select 1");
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
