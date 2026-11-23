import { currentActor } from "@/auth/current";
import { PDF, readFile } from "@/content/files";
import { getMaterial } from "@/content/material";
import { db } from "@/db/client";

/** A reading's PDF, for a teacher of its course: the material page shows it as pages (feedback 8697eb90). */
export async function GET(_request: Request, ctx: RouteContext<"/api/courses/[courseId]/materials/[materialId]/file">) {
  const actor = await currentActor();
  if (!actor) return new Response("Sign in again to see this material.", { status: 401 });
  const { courseId, materialId } = await ctx.params;
  const material = await getMaterial(db(), actor, courseId, materialId);
  const bytes = material?.hasFile ? await readFile(db(), material.id) : null;
  if (!material || !bytes) return new Response("We couldn't find that material.", { status: 404 });
  const name = encodeURIComponent(material.name.toLowerCase().endsWith(".pdf") ? material.name : `${material.name}.pdf`);
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": PDF,
      "content-disposition": `inline; filename*=UTF-8''${name}`,
      "cache-control": "private, no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}
