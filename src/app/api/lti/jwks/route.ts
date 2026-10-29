import { LtiKeyError, toolKey } from "@/lti/keys";

/** DALAA's public signing key, for Canvas to verify what DALAA signs (D-020). */
export async function GET() {
  try {
    const { publicJwk } = await toolKey();
    return Response.json({ keys: [publicJwk] }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    if (e instanceof LtiKeyError) return Response.json({ error: "LTI is not configured" }, { status: 503 });
    throw e;
  }
}
