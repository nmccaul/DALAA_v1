import { dictationModel } from "@/ai/models";
import { currentActor } from "@/auth/current";
import { db } from "@/db/client";
import { dictate, DICTATION_REFUSED, MAX_DICTATION_BYTES } from "@/tools/study-chat/chat";

export const maxDuration = 60;

/**
 * A student's spoken message (D-038): the recording in, `{ text }` back for
 * them to check before sending. Every rule is checked in `dictate`.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/study-chat/[activityId]/dictate">) {
  const actor = await currentActor();
  if (!actor) return Response.json({ reason: "Sign in again to keep chatting." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_DICTATION_BYTES) {
    return Response.json({ reason: DICTATION_REFUSED.long }, { status: 413 });
  }
  const { activityId } = await ctx.params;
  const audio = new Uint8Array(await request.arrayBuffer());
  const result = await dictate(db(), dictationModel(), actor, activityId, audio, request.signal);
  return result.ok ? Response.json({ text: result.text }) : Response.json({ reason: result.reason }, { status: result.status });
}
