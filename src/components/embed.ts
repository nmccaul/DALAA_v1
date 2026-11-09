import { headers } from "next/headers";

/**
 * Whether this page is loading inside a frame: in practice, inside Canvas
 * after an LTI launch. Canvas already draws the global nav, the course menu
 * and the breadcrumb around us, so framed pages show only their content
 * (D-032). Browsers send `Sec-Fetch-Dest: iframe` on every navigation inside
 * a frame; the new-tab fallback (src/lti/handoff.ts) is a top-level
 * `document` load and gets the full shell.
 */
export async function inFrame(): Promise<boolean> {
  return (await headers()).get("sec-fetch-dest") === "iframe";
}
