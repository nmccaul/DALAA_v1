import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/auth/current";
import { EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db/client";
import { kindLabel } from "@/feedback/report";
import { listReports } from "@/feedback/store";
import { when } from "./when";

export const metadata: Metadata = { title: "Feedback reports" };

/** Every report from the feedback button, newest first. Admins only. */
export default async function FeedbackReportsPage() {
  const actor = await requireActor();
  if (!actor.isAdmin) notFound();
  const reports = await listReports(db(), actor);
  const open = reports.filter((r) => r.status === "open").length;

  return (
    <>
      <PageHeader
        title="Feedback reports"
        description={reports.length ? `${open} open of ${reports.length}. Newest first.` : undefined}
      />
      {reports.length === 0 ? (
        <EmptyState title="No reports yet">
          When someone uses the Feedback button on any page, what they wrote and a picture of the page show up here.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
          {reports.map((r) => (
            <li key={r.id}>
              <Link href={`/settings/feedback/${r.id}`} className="flex flex-col gap-1 px-5 py-4 hover:bg-accent-soft">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span className="font-medium text-text">{kindLabel(r.kind)}</span>
                  <span>{r.reporter}</span>
                  <span>{when.format(r.createdAt)}</span>
                  {r.status === "resolved" && <span className="rounded-control bg-accent-soft px-2 py-0.5">Resolved</span>}
                  {r.hasScreenshot && <span>Has a picture</span>}
                </div>
                <p className="line-clamp-2">{r.note}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
