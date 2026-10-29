import { currentActor } from "@/auth/current";
import { db } from "@/db/client";
import { getScreenshot } from "@/feedback/store";

/** A report's screenshot, for the admin feedback page. Anyone else gets a 404. */
export async function GET(_request: Request, ctx: RouteContext<"/api/feedback/[id]/screenshot">) {
  const actor = await currentActor();
  const { id } = await ctx.params;
  const shot = actor ? await getScreenshot(db(), actor, id) : null;
  if (!shot) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(shot.bytes), {
    headers: { "Content-Type": shot.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
