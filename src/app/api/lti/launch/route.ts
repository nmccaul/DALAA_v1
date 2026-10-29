import { startSession } from "@/auth/current";
import { db } from "@/db/client";
import { appUrl } from "@/lti/config";
import { signInFromLaunch } from "@/lti/launch";
import { readLaunchInput, remoteKeys, validateLaunch } from "@/lti/validate";

/**
 * The LTI launch from Canvas (D-020): a POST with id_token and state. A
 * verified launch signs the user in and goes to their course. The redirect
 * goes to DALAA's own origin, never to a URL taken from the launch.
 */
export async function POST(request: Request) {
  const database = db();
  const result = await validateLaunch(database, await readLaunchInput(request), remoteKeys);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  const signedIn = await signInFromLaunch(database, result.claims);
  if (!signedIn.ok) return Response.json({ error: signedIn.error }, { status: signedIn.status });

  await startSession(signedIn.userId);
  return new Response(null, { status: 303, headers: { Location: new URL(signedIn.path, appUrl(request)).toString() } });
}
