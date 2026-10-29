import { currentActor } from "@/auth/current";
import { beginOAuth, canvasBaseUrl, connectReturnPath } from "@/canvas/connection";
import { authorizeUrl, oauthApp, oauthRedirectUri } from "@/canvas/oauth";
import { db } from "@/db/client";
import { appUrl } from "@/lti/config";

/** "Connect with Canvas": sends the teacher to Canvas to approve DALAA (T16a). */
export async function GET(request: Request) {
  const origin = appUrl(request);
  const next = connectReturnPath(new URL(request.url).searchParams.get("next"));
  const actor = await currentActor();
  if (!actor) return Response.redirect(new URL("/sign-in", origin), 303);
  const app = oauthApp(canvasBaseUrl());
  if (!actor.isStaff || !app) {
    return Response.redirect(new URL(`/canvas/connect?next=${encodeURIComponent(next)}`, origin), 303);
  }
  const state = await beginOAuth(db(), actor, next);
  return Response.redirect(authorizeUrl(app, state, oauthRedirectUri(origin)), 303);
}
