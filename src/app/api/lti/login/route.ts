import { institutionId } from "@/auth/current";
import { db } from "@/db/client";
import { appUrl, ltiUrls } from "@/lti/config";
import { beginLogin, readLoginParams } from "@/lti/login";
import { envRegistration } from "@/lti/registration";

/** OIDC login initiation from Canvas (D-020): Canvas may use GET or POST. */
async function handle(request: Request) {
  const result = await beginLogin(
    db(),
    await institutionId(),
    envRegistration(),
    await readLoginParams(request),
    ltiUrls(appUrl(request)).launch,
  );
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.redirect(result.redirect, 302);
}

export const GET = handle;
export const POST = handle;
