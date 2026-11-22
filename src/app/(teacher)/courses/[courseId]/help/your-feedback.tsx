import { CaretRight, Check } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { standing, type MyReport, type Standing } from "@/feedback/mine";
import type { Kind } from "@/feedback/report";

const KIND: Record<Kind, string> = { bug: "Bug", confusing: "Confusing", idea: "Idea" };

const PILL: Record<string, string> = {
  fixed: "bg-success/10 text-success",
  closed: "bg-subtle text-muted",
  working: "bg-accent-soft text-accent-text",
  waiting: "bg-warn-soft text-warn-text",
  received: "border border-border-strong text-muted",
};

function pill(s: Standing): string {
  if (s.done) return PILL[s.done];
  if (s.label === "Received") return PILL.received;
  if (s.label === "Waiting on a decision") return PILL.waiting;
  return PILL.working;
}

/**
 * The Help tab's "Your feedback" (feedback 3df5d2ca, 107d2eb9): what the
 * teacher sent and where it stands. Open ones first; fixed ones are crossed
 * off under Done, which folds away. `everyone` is an admin's view of all
 * reports: it names who sent each, and each opens in the Settings inbox.
 */
export function YourFeedback({ reports, everyone = false }: { reports: MyReport[]; everyone?: boolean }) {
  if (reports.length === 0) {
    return (
      <p className="text-muted">
        {everyone ? "No one has sent feedback yet." : "Nothing yet. What you send shows up here, and is crossed off when it's fixed."}
      </p>
    );
  }
  const rows = reports.map((r) => ({ r, s: standing(r) }));
  const open = rows.filter((x) => !x.s.done);
  const done = rows.filter((x) => x.s.done).sort((a, b) => (b.s.at?.getTime() ?? 0) - (a.s.at?.getTime() ?? 0));
  return (
    <div className="flex flex-col divide-y divide-border rounded-panel border border-border">
      <Group title="Open" rows={open} open everyone={everyone} empty={everyone ? "Nothing open." : "Nothing open: everything you sent has been dealt with."} />
      <Group title="Done" rows={done} open={false} everyone={everyone} empty="Nothing fixed yet." />
    </div>
  );
}

function Group({
  title,
  rows,
  open,
  everyone,
  empty,
}: {
  title: string;
  rows: { r: MyReport; s: Standing }[];
  open: boolean;
  everyone: boolean;
  empty: string;
}) {
  return (
    <details open={open} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-subtle [&::-webkit-details-marker]:hidden">
        <CaretRight size={14} weight="bold" aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-90" />
        <span className="font-bold">{title}</span>
        <span className="ml-auto text-sm text-muted">{rows.length}</span>
      </summary>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 pl-11 text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {rows.map(({ r, s }) => (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:pl-11">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className={`break-words whitespace-pre-line ${s.done === "fixed" ? "text-muted line-through" : ""}`}>
                  {everyone ? (
                    <Link href={`/settings/feedback/${r.id}`} className="hover:text-accent hover:underline">
                      {r.note}
                    </Link>
                  ) : (
                    r.note
                  )}
                </p>
                <p className="text-[13px] text-muted">
                  {KIND[r.kind]}
                  {everyone && <> · {r.reporter}</>} · Sent <LocalTime value={r.createdAt} style="day" />
                </p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1 self-start rounded-full px-2.5 py-0.5 text-[13px] font-bold ${pill(s)}`}>
                {s.done === "fixed" && <Check size={13} weight="bold" aria-hidden />}
                {s.label}
                {s.at && (
                  <span className="font-normal">
                    {" · "}
                    <LocalTime value={s.at} style="day" />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
