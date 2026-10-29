/**
 * The plain pages an LTI launch shows inside Canvas: launch errors and the
 * new-tab button. A full HTML response from a route handler, because these
 * answer a cross-site form POST where DALAA's session (and app shell) may not
 * exist yet. System colors only, so light and dark both work without
 * hard-coded values.
 */

export type LtiPage = {
  title: string;
  message: string;
  /** One button; `newTab` opens it outside the Canvas iframe. */
  action?: { href: string; label: string; newTab?: boolean };
};

/** A spent, expired or unknown login code. */
export const EXPIRED_LINK: LtiPage = {
  title: "This link has expired",
  message: "Open DALAA again from your Canvas course.",
};

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function ltiPageHtml({ title, message, action }: LtiPage): string {
  const button = action
    ? `<p><a class="button" href="${escape(action.href)}"${action.newTab ? ' target="_blank" rel="noopener"' : ""}>${escape(action.label)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)} · DALAA</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; padding: 2rem 1.25rem; background: Canvas; color: CanvasText; }
  main { max-width: 32rem; margin: 0 auto; line-height: 1.5; }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
  .button { display: inline-block; padding: 0.6rem 1rem; border-radius: 0.5rem;
    background: ButtonText; color: ButtonFace; text-decoration: none; font-weight: 600; }
</style>
</head>
<body><main><h1>${escape(title)}</h1><p>${escape(message)}</p>${button}</main></body>
</html>`;
}

export function ltiPage(page: LtiPage, status = 200): Response {
  return new Response(ltiPageHtml(page), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
