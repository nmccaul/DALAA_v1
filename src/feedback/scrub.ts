/**
 * Redacts secrets from text captured in the browser (console lines, error
 * stacks, URLs) before a feedback report leaves it, and again on the server.
 * DALAA never collects names or emails on purpose; this guards against a
 * token or session riding along in a log line or query string.
 */

const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const SECRET_PARAM = /([?&;](?:[a-z_]*token|api[-_]?key|key|secret|password|code|state|session|id_token)=)[^&#\s]*/gi;
const SECRET_PAIR = /((?:authorization|api[-_]?key|token|secret|password|bearer|cookie|session)["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^\s"',;}]+/gi;
const OPAQUE = /[A-Za-z0-9_-]{40,}/g;

/** The text with secrets replaced, cut to `max` characters. */
export function scrub(text: string, max: number): string {
  const clean = text
    .replace(JWT, "[redacted-jwt]")
    .replace(SECRET_PARAM, "$1[redacted]")
    .replace(SECRET_PAIR, "$1[redacted]")
    .replace(OPAQUE, "[redacted]");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
