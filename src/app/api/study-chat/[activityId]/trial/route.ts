import { chatModel, graderModel } from "@/ai/models";
import { currentActor } from "@/auth/current";
import { db } from "@/db/client";
import { runTrial, trialEnding, TRIAL_LEVELS, type TrialLevel } from "@/tools/study-chat/trial";
import { trialResponse } from "@/tools/study-chat/trial-stream";

/** Up to 3 minutes of chatting, then grading (trial.ts `TRIAL_CHAT_MS`). */
export const maxDuration = 300;

/**
 * A practice run with a sample student: `{ level }` in, each exchange
 * streamed back as it happens, then the grade (trial-stream.ts). Stops when
 * the teacher leaves the page.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/study-chat/[activityId]/trial">) {
  const actor = await currentActor();
  if (!actor) return Response.json({ reason: "Sign in again to run it." }, { status: 401 });
  const { activityId } = await ctx.params;
  const input: unknown = await request.json().catch(() => null);
  const level = (input as { level?: unknown } | null)?.level;
  if (!(TRIAL_LEVELS as readonly unknown[]).includes(level)) {
    return Response.json({ reason: "Pick a struggling or a strong student." }, { status: 400 });
  }

  const chat = chatModel();
  const models = { student: chat, reply: chat, check: chat, grader: graderModel() };
  return trialResponse(
    (onStep) => runTrial(db(), models, actor, activityId, level as TrialLevel, { onStep, signal: request.signal }),
    trialEnding,
  );
}
