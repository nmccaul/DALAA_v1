import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireActor } from "@/auth/current";
import { LocalTime } from "@/components/local-time";
import { Button, PageHeader, inputStyles } from "@/components/ui";
import { db } from "@/db/client";
import type { FixStatus } from "@/feedback/fixes";
import { kindLabel } from "@/feedback/report";
import { getReport } from "@/feedback/store";
import { resolveReportAction } from "../actions";

export const metadata: Metadata = { title: "Feedback report" };

const fixLabel: Record<FixStatus, string> = {
  in_progress: "Being worked on",
  fixed: "Fixed",
  wont_fix: "Works as designed",
  cant_reproduce: "Couldn't reproduce",
  needs_nathan: "Waiting for Nathan to decide",
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** One report: what they wrote, the picture, the page, the console and errors, the commit. Admins only. */
export default async function FeedbackReportPage({ params, searchParams }: PageProps<"/settings/feedback/[id]">) {
  const actor = await requireActor();
  if (!actor.isAdmin) notFound();
  const { id } = await params;
  const { error } = await searchParams;
  const report = await getReport(db(), actor, id);
  if (!report) notFound();
  const { context } = report;

  return (
    <>
      <Link href="/settings/feedback" className="text-sm text-muted hover:text-text">← All feedback reports</Link>
      <PageHeader
        title={kindLabel(report.kind)}
        description={<>From {report.reporter}, <LocalTime value={report.createdAt} /></>}
      />
      <div className="flex max-w-4xl flex-col gap-6">
        <p className="whitespace-pre-wrap rounded-panel border border-border bg-surface p-5">{report.note}</p>

        {report.hasScreenshot && (
          // eslint-disable-next-line @next/next/no-img-element -- served from our own admin-only route, sized by the capture
          <img
            src={`/api/feedback/${report.id}/screenshot`}
            alt="The page as the reporter saw it"
            className="w-full rounded-panel border border-border"
          />
        )}
        {report.hasScreenshot && context.annotated && <p className="-mt-4 text-sm text-muted">The reporter marked up this picture.</p>}

        <dl className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-5">
          <Row label="Page"><span className="font-mono text-sm" translate="no">{report.url}</span></Row>
          <Row label="Title">{context.title || "None"}</Row>
          <Row label="Screen">
            {context.viewport ? `${context.viewport.w} × ${context.viewport.h} at ${context.viewport.dpr}×, ${context.colorScheme}` : "Not captured"}
          </Row>
          <Row label="Browser"><span className="text-sm">{context.userAgent || "Not captured"}</span></Row>
          <Row label="Commit">
            <span className="font-mono text-sm" translate="no">{report.appCommit ?? "None (not a deployed build)"}</span>
          </Row>
          <Row label="Id"><span className="font-mono text-sm" translate="no">{report.id}</span></Row>
        </dl>

        <LogList title={`Errors thrown — ${context.errors?.length ?? 0}`}>
          {context.errors?.map((e, i) => (
            <li key={i}>
              <span className="text-muted"><LocalTime value={e.t} style="clock" /></span> {e.message}
              {e.stack && <pre className="mt-1 overflow-x-auto text-xs text-muted">{e.stack}</pre>}
            </li>
          ))}
        </LogList>
        <LogList title={`Console warnings and errors — ${context.console?.length ?? 0}`}>
          {context.console?.map((c, i) => (
            <li key={i}>
              <span className="text-muted"><LocalTime value={c.t} style="clock" /> {c.level}</span> {c.text}
            </li>
          ))}
        </LogList>

        {report.fix && (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold">What the bug loop did</h2>
            <dl className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-5">
              <Row label="Outcome">{fixLabel[report.fix.status]}</Row>
              {report.fix.prUrl && (
                <Row label="Pull request">
                  <a href={report.fix.prUrl} className="underline" target="_blank" rel="noreferrer">{report.fix.prUrl}</a>
                </Row>
              )}
              {report.fix.branch && <Row label="Branch"><span className="font-mono text-sm" translate="no">{report.fix.branch}</span></Row>}
              {report.fix.commit && <Row label="Fixed in"><span className="font-mono text-sm" translate="no">{report.fix.commit}</span></Row>}
              {report.fix.note && <Row label="Note"><span className="whitespace-pre-wrap">{report.fix.note}</span></Row>}
            </dl>
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-5">
          {report.status === "resolved" ? (
            <p>
              Resolved{report.fixedCommit && (
                <> in <span className="font-mono" translate="no">{report.fixedCommit}</span></>
              )}.
            </p>
          ) : (
            <form action={resolveReportAction} className="flex flex-col items-start gap-3">
              <input type="hidden" name="id" value={report.id} />
              <label className="flex w-full max-w-sm flex-col gap-1 text-sm">
                Commit that fixed it (optional)
                <input name="commit" className={`${inputStyles} font-mono`} placeholder="a1b2c3d" autoComplete="off" />
              </label>
              {error && <p className="text-sm text-danger">That isn&apos;t a commit SHA. Leave it blank or paste the short SHA.</p>}
              <Button>Mark resolved</Button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}

function LogList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <ol className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-5 font-mono text-sm empty:hidden">{children}</ol>
    </section>
  );
}
