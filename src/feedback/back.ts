/**
 * Where "‹ Back" on an admin's feedback report goes (feedback 42c212ac): the
 * Help tab's feedback list they opened it from, filters and all, or else the
 * Settings inbox. `from` comes from the address, so only those two pages are
 * accepted: never another site, a protocol-relative `//…`, or any other path.
 */

const INBOX = "/settings/feedback";
const HELP = /^\/courses\/[0-9a-f-]{36}\/help(\?[A-Za-z0-9=&%_.-]*)?(#feedback)?$/i;

export type Back = { href: string; label: string };

export function feedbackBack(from: string | string[] | undefined): Back {
  if (typeof from === "string" && HELP.test(from)) {
    return { href: from.includes("#") ? from : `${from}#feedback`, label: "‹ Back to feedback" };
  }
  return { href: INBOX, label: "‹ All feedback reports" };
}

/** A report's page, remembering the list it was opened from. */
export function reportHref(id: string, from: string): string {
  return `${INBOX}/${id}?from=${encodeURIComponent(from)}`;
}
