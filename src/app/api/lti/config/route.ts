import { appUrl, canvasConfig } from "@/lti/config";

/** The Canvas JSON configuration for DALAA's LTI developer key. */
export async function GET(request: Request) {
  return Response.json(canvasConfig(appUrl(request)));
}
