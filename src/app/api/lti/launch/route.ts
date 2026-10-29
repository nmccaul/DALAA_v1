import { startSession } from "@/auth/current";
import { db } from "@/db/client";
import { appUrl } from "@/lti/config";
import { createLoginCode } from "@/lti/handoff";
import { signInFromLaunch } from "@/lti/launch";
import { ltiPage } from "@/lti/page";
import { readLaunchInput, remoteKeys, validateLaunch } from "@/lti/validate";

const refused = (status: number, error: string) =>
  ltiPage({ title: "DALAA couldn't open", message: error }, status);

/**
 * The LTI launch from Canvas (D-020): a POST with id_token and state. A
 * verified launch signs the user in and goes through /api/lti/landed, which
 * checks the cookie survived the Canvas iframe (src/lti/handoff.ts). Redirects
 * go to DALAA's own origin, never to a URL taken from the launch. Errors are a
 * plain page, since they show inside Canvas.
 */
export async function POST(request: Request) {
  const database = db();
  const result = await validateLaunch(database, await readLaunchInput(request), remoteKeys);
  if (!result.ok) return refused(result.status, result.error);

  const signedIn = await signInFromLaunch(database, result.claims);
  if (!signedIn.ok) return refused(signedIn.status, signedIn.error);

  await startSession(signedIn.userId);
  const code = await createLoginCode(database, signedIn.userId, signedIn.path);
  const landed = new URL("/api/lti/landed", appUrl(request));
  landed.searchParams.set("code", code);
  return new Response(null, { status: 303, headers: { Location: landed.toString() } });
}
