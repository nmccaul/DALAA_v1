import { currentActor } from "@/auth/current";
import { canvasCodeExchange, finishOAuth } from "@/canvas/connection";
import { oauthRedirectUri } from "@/canvas/oauth";
import { db } from "@/db/client";
import { appUrl } from "@/lti/config";

/** Canvas sends the teacher back here with a code (or an error) and the state (T16a). */
export async function GET(request: Request) {
  const origin = appUrl(request);
  const q = new URL(request.url).searchParams;
  const actor = await currentActor();
  const exchange = canvasCodeExchange(oauthRedirectUri(origin));
  if (!actor) return Response.redirect(new URL("/sign-in", origin), 303);
  if (!exchange) return Response.redirect(new URL("/canvas/connect", origin), 303);

  const result = await finishOAuth(
    db(),
    actor,
    { code: q.get("code"), state: q.get("state"), error: q.get("error") },
    exchange,
  );
  if (result.ok) return Response.redirect(new URL(result.next, origin), 303);
  const retry = new URLSearchParams({ error: result.reason });
  if (result.reason !== "expired") retry.set("next", result.next);
  return Response.redirect(new URL(`/canvas/connect?${retry}`, origin), 303);
}
