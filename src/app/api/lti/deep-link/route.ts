import { currentActor } from "@/auth/current";
import { db } from "@/db/client";
import { appUrl, ltiUrls } from "@/lti/config";
import { answerDeepLink } from "@/lti/deep-link";
import { toolKey } from "@/lti/keys";
import { ltiFormPost, ltiPage } from "@/lti/page";

/**
 * The teacher's pick from /courses/[id]/add-to-canvas/[requestId]: signs the
 * deep-linking answer and posts it back to Canvas (src/lti/deep-link.ts). The
 * return URL comes from the stored, verified request, never from this form.
 */
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return ltiPage({ title: "DALAA couldn't add this", message: "Choose DALAA again in Canvas." }, 401);
  const form = await request.formData().catch(() => null);
  const field = (k: string) => String(form?.get(k) ?? "");

  const answer = await answerDeepLink(db(), actor, field("request"), field("activity"), {
    key: await toolKey(),
    launchUrl: ltiUrls(appUrl(request)).launch,
  });
  if (!answer.ok) return ltiPage({ title: "DALAA couldn't add this", message: answer.reason }, 400);
  return ltiFormPost({ title: "Adding to Canvas…", message: "Sending your assignment to Canvas." }, answer.returnUrl, {
    JWT: answer.jwt,
  });
}
