/**
 * Which Canvas this deployment serves. One institution in v1 (D-018): BYU's
 * Canvas by default, or the one `CANVAS_BASE_URL` names (gitgrade, whose
 * login IDs are emails, D-025).
 */

const BYU_CANVAS = "https://byu.instructure.com";

/** Where real Canvas is. */
export function canvasBaseUrl(): string {
  return process.env.CANVAS_BASE_URL || BYU_CANVAS;
}

/** Whether people sign in with a BYU NetID here (rather than another Canvas's login ID). */
export function usesNetIds(baseUrl = canvasBaseUrl()): boolean {
  return new URL(baseUrl).hostname === new URL(BYU_CANVAS).hostname;
}
