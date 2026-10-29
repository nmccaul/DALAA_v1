import { currentActor } from "@/auth/current";
import { db } from "@/db/client";
import { saveReport } from "@/feedback/store";

/**
 * A report from the feedback button (src/feedback/report.ts) in, `{ id }` or
 * `{ throttled }` out. The deployed commit is stamped here, never trusted
 * from the browser.
 */
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({ reason: "Sign in again to send feedback." }, { status: 401 });
  const input: unknown = await request.json().catch(() => null);
  const appCommit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || null;
  const outcome = await saveReport(db(), actor, input, appCommit);
  if (!outcome.ok) return Response.json({ reason: outcome.reason }, { status: 400 });
  return Response.json(outcome);
}
