import { db } from "@/db/client";
import { readLaunchInput, validateLaunch } from "@/lti/validate";

/**
 * The LTI launch from Canvas (D-020): a POST with id_token and state. Until
 * launch sign-in lands (T08), a verified launch only says so.
 */
export async function POST(request: Request) {
  const result = await validateLaunch(db(), await readLaunchInput(request));
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true, messageType: result.claims.messageType });
}
