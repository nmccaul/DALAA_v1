import type { Metadata } from "next";
import Link from "next/link";
import { Button, PageHeader, buttonStyles } from "@/components/ui";
import { canvasBaseUrl, connectReturnPath } from "@/canvas/connection";
import { oauthApp } from "@/canvas/oauth";
import { choosePracticeCanvasAction } from "./actions";
import { TokenForm } from "./token-form";

export const metadata: Metadata = { title: "Connect Canvas" };

/** Why "Connect with Canvas" came back without connecting (/api/canvas/oauth/callback). */
const OAUTH_ERRORS: Record<string, string> = {
  expired: "That took too long, or it was started in another window. Try again.",
  denied: "Canvas didn't connect because the request wasn't approved. Try again and click Authorize.",
  rejected: "Canvas didn't accept the connection. Try again.",
  unavailable: "We couldn't reach Canvas just now. Try again in a minute.",
};

export default async function ConnectCanvasPage({ searchParams }: PageProps<"/canvas/connect">) {
  const { next, error } = await searchParams;
  const back = connectReturnPath(next);
  const settingsUrl = `${canvasBaseUrl()}/profile/settings`;
  const oauth = oauthApp(canvasBaseUrl()) !== null;
  const oauthError = typeof error === "string" ? OAUTH_ERRORS[error] : undefined;

  const tokenSteps = (
    <>
      <ol className="flex flex-col gap-4">
        <li className="flex gap-3">
          <span className="font-display font-semibold text-accent-text">1</span>
          <div className="flex flex-col gap-2">
            <p>Open your Canvas settings. It opens in a new tab so you can come back here.</p>
            <a
              href={settingsUrl}
              target="_blank"
              rel="noreferrer"
              className="self-start rounded-control border border-border-strong px-3 py-1.5 text-sm font-medium hover:bg-accent-soft"
            >
              Open Canvas settings ↗
            </a>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="font-display font-semibold text-accent-text">2</span>
          <p>
            Scroll to <strong>Approved Integrations</strong> and click <strong>New Access Token</strong>. Name it
            &ldquo;DALAA&rdquo;. You can leave the expiry date empty, or set it to the end of the term.
          </p>
        </li>
        <li className="flex gap-3">
          <span className="font-display font-semibold text-accent-text">3</span>
          <p>
            Click <strong>Generate Token</strong>, copy the long token Canvas shows you, and paste it here.
          </p>
        </li>
      </ol>
      <TokenForm next={back} />
      <p className="text-sm text-muted">
        DALAA keeps your token encrypted and never shows it again. You can cancel it any time in Canvas under
        Approved Integrations.
      </p>
    </>
  );

  return (
    <>
      <Link href={back} className="-mb-4 text-sm text-muted hover:text-text">
        ← Back
      </Link>
      <PageHeader
        title="Connect Canvas"
        description="DALAA uses your Canvas access to bring in your courses, class lists and course pages, and to post grades when you click Post grades. Nothing changes in Canvas until you ask."
      />

      <section className="flex max-w-2xl flex-col gap-6 rounded-panel border border-border bg-surface p-6">
        {oauth ? (
          <>
            <div className="flex flex-col items-start gap-3">
              <p>Canvas asks you to approve DALAA, then brings you back here.</p>
              {oauthError && (
                <p role="alert" className="text-sm text-danger">
                  {oauthError}
                </p>
              )}
              {/* A plain link, not <Link>: prefetching would start an OAuth state on every render. */}
              <a href={`/api/canvas/oauth/start?next=${encodeURIComponent(back)}`} className={buttonStyles.primary}>
                Connect with Canvas
              </a>
            </div>
            <details className="flex flex-col gap-6 text-sm">
              <summary className="cursor-pointer text-muted">Or paste a Canvas access token</summary>
              <div className="mt-4 flex flex-col gap-6 text-base">{tokenSteps}</div>
            </details>
          </>
        ) : (
          tokenSteps
        )}
      </section>

      <section className="flex max-w-2xl flex-col items-start gap-3 rounded-panel border border-dashed border-border-strong/60 p-6">
        <h2 className="font-display text-lg font-semibold">Just looking around?</h2>
        <p className="text-muted">
          Use practice Canvas: made-up courses and students, so you can try everything without touching your real
          Canvas.
        </p>
        <form action={choosePracticeCanvasAction}>
          <input type="hidden" name="next" value={back} />
          <Button variant="secondary">Use practice Canvas</Button>
        </form>
      </section>
    </>
  );
}
