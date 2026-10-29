/**
 * The "Add to Canvas" picker's path, and the query parameter that keeps an
 * open picker through creating a new assignment so Publish returns to it
 * (src/lti/deep-link.ts). No server imports: the create forms are client
 * components and carry the parameter as a hidden field.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The query parameter (and form field) carrying the picker's request id. */
export const PICKER_PARAM = "addToCanvas";

/** The DALAA path where the teacher picks what to add. */
export const deepLinkPath = (courseId: string, requestId: string) => `/courses/${courseId}/add-to-canvas/${requestId}`;

/**
 * The picker's request id from a query or form value, or null when there is
 * none or it isn't one. Whether it's still open is the picker page's check.
 */
export function pickerRequest(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}

/** A DALAA path with the open picker kept on it; unchanged when there is none. */
export function keepPicker(path: string, requestId: string | null): string {
  if (!requestId) return path;
  const url = new URL(path, "http://dalaa.local");
  url.searchParams.set(PICKER_PARAM, requestId);
  return `${url.pathname}${url.search}`;
}

/** Where Publish lands: back on the picker when the teacher came from Canvas, else the course. */
export function afterPublishPath(courseId: string, requestId: string | null): string {
  return requestId ? deepLinkPath(courseId, requestId) : `/courses/${courseId}`;
}
