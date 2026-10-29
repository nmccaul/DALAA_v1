import { startSession } from "@/auth/current";
import { db } from "@/db/client";
import { appUrl } from "@/lti/config";
import { redeemLoginCode } from "@/lti/handoff";
import { EXPIRED_LINK, ltiPage } from "@/lti/page";

/**
 * The new tab from /api/lti/landed: spends the one-time code and starts the
 * session first-party, then lands where the launch was going.
 */
export async function GET(request: Request) {
  const redeemed = await redeemLoginCode(db(), new URL(request.url).searchParams.get("code"));
  if (!redeemed) {
    return ltiPage(EXPIRED_LINK, 410);
  }
  await startSession(redeemed.userId);
  return new Response(null, {
    status: 303,
    headers: { Location: new URL(redeemed.path, appUrl(request)).toString() },
  });
}
