import { activityReadings } from "@/activities/materials";
import { getTaughtActivity } from "@/activities/store";
import { getTakenActivity } from "@/attempts/store";
import { currentActor } from "@/auth/current";
import { PDF, readFile } from "@/content/files";
import { db } from "@/db/client";

/**
 * A reading's PDF, for a student who can take the activity or a teacher of
 * its course. Only a reading of this activity: never an AI-only note, never
 * another course's file.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/activities/[activityId]/readings/[contentId]">) {
  const actor = await currentActor();
  if (!actor) return new Response("Sign in again to see this reading.", { status: 401 });
  const { activityId, contentId } = await ctx.params;
  const taken = await getTakenActivity(db(), actor, activityId);
  const readings = taken
    ? taken.readings
    : (await getTaughtActivity(db(), actor, activityId))
      ? await activityReadings(db(), activityId)
      : [];
  const reading = readings.find((r) => r.id === contentId && r.hasFile);
  const bytes = reading ? await readFile(db(), reading.id) : null;
  if (!reading || !bytes) return new Response("We couldn't find that reading.", { status: 404 });
  const name = encodeURIComponent(reading.name.toLowerCase().endsWith(".pdf") ? reading.name : `${reading.name}.pdf`);
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": PDF,
      "content-disposition": `inline; filename*=UTF-8''${name}`,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

