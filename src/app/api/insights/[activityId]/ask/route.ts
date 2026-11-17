import { after } from "next/server";
import { chatModel } from "@/ai/models";
import { currentActor } from "@/auth/current";
import { db } from "@/db/client";
import { ASK_FAILED, askAboutClass, readHistory } from "@/results/ask";
import { askResponse } from "@/results/ask-stream";

/** One answer from the chat model; the class's conversations are read in the same request. */
export const maxDuration = 120;

/**
 * A teacher's question about one assignment's conversations: `{ question,
 * history }` in, the answer streamed back (src/results/ask-stream.ts). Who
 * may ask, and how often, is checked in `askAboutClass`.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/insights/[activityId]/ask">) {
  const actor = await currentActor();
  if (!actor) return Response.json({ reason: "Sign in again to ask." }, { status: 401 });
  const { activityId } = await ctx.params;
  const input = ((await request.json().catch(() => null)) ?? {}) as { question?: unknown; history?: unknown };
  const question = typeof input.question === "string" ? input.question : "";

  const started = await askAboutClass(db(), chatModel(), actor, activityId, question, readHistory(input.history));
  if (started.kind === "refused") return Response.json({ reason: started.reason }, { status: started.status });
  const { response, settled } = askResponse(started, ASK_FAILED);
  after(() => settled);
  return response;
}
