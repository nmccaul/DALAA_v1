import { after } from "next/server";
import { chatModel } from "@/ai/models";
import { currentActor } from "@/auth/current";
import { db } from "@/db/client";
import { sendTurn, validTurnKey } from "@/tools/study-chat/chat";
import { turnResponse } from "@/tools/study-chat/turn-stream";

/** A long reply plus the question check; the turn must be saved before the function stops. */
export const maxDuration = 120;

/**
 * One student message in a Study Chat: `{ clientKey, message }` in, the reply
 * streamed back (src/tools/study-chat/turn-stream.ts). Every limit is checked
 * in `sendTurn`; this only reads the request and keeps the function alive
 * until the turn is saved.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/study-chat/[activityId]/turn">) {
  const actor = await currentActor();
  if (!actor) return Response.json({ reason: "Sign in again to keep chatting." }, { status: 401 });
  const { activityId } = await ctx.params;
  const input: unknown = await request.json().catch(() => null);
  const { clientKey, message } = (input ?? {}) as { clientKey?: unknown; message?: unknown };
  if (typeof clientKey !== "string" || typeof message !== "string" || !validTurnKey(clientKey)) {
    return Response.json({ reason: "That message didn't arrive. Reload the page and try again." }, { status: 400 });
  }

  const model = chatModel();
  const result = await sendTurn(db(), { reply: model, check: model }, actor, activityId, { clientKey, message });
  const { response, settled } = turnResponse(result);
  after(settled);
  return response;
}
