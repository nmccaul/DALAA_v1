import { sessionUserId } from "@/auth/current";
import { db } from "@/db/client";
import { appUrl } from "@/lti/config";
import { land } from "@/lti/handoff";
import { EXPIRED_LINK, ltiPage } from "@/lti/page";

/**
 * Where every launch lands (src/lti/handoff.ts): on to the course when the
 * session cookie made it through the Canvas iframe, else the new-tab button.
 */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  const landing = await land(db(), code, await sessionUserId());
  const base = appUrl(request);
  if (landing.kind === "go") {
    return new Response(null, { status: 303, headers: { Location: new URL(landing.path, base).toString() } });
  }
  if (landing.kind === "expired") {
    return ltiPage(EXPIRED_LINK, 410);
  }
  const open = new URL("/api/lti/open", base);
  open.searchParams.set("code", landing.code);
  return ltiPage({
    title: "Open DALAA in a new tab",
    message: "Your browser won't let DALAA sign you in inside Canvas. It will work in its own tab.",
    action: { href: open.toString(), label: "Open DALAA in a new tab", newTab: true },
  });
}
