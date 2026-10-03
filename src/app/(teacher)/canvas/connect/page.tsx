import type { Metadata } from "next";
import Link from "next/link";
import { Button, PageHeader } from "@/components/ui";
import { canvasBaseUrl } from "@/canvas/connection";
import { choosePracticeCanvasAction } from "./actions";
import { TokenForm } from "./token-form";

export const metadata: Metadata = { title: "Connect Canvas" };

export default async function ConnectCanvasPage({ searchParams }: PageProps<"/canvas/connect">) {
  const { next } = await searchParams;
  const back = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/settings";
  const settingsUrl = `${canvasBaseUrl()}/profile/settings`;

  return (
    <>
      <Link href={back} className="-mb-4 text-sm text-muted hover:text-text">
        ← Back
      </Link>
      <PageHeader
        title="Connect Canvas"
        description="DALAA uses your Canvas access to bring in your courses and class lists, and to post grades when you click Post grades. Nothing changes in Canvas until you ask."
      />

      <section className="flex max-w-2xl flex-col gap-6 rounded-panel border border-border bg-surface p-6">
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
