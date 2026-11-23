/**
 * The pictures on an assignment's Insights page (D-035), for every tool:
 * plain HTML and CSS bars on the design tokens, no chart library. Each says
 * in words what it shows (`aria-label`, or its own text), so it reads the
 * same without the picture.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { BriefItem } from "./brief";
import type { Tally } from "./insights";

export const share = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));
export const studentsLabel = (n: number) => `${n} ${n === 1 ? "student" : "students"}`;
export const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** One number that matters, with what it counts. */
export function StatTile({ label, value, note, tone = "plain" }: { label: string; value: ReactNode; note?: ReactNode; tone?: "plain" | "warn" }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-panel border px-4 py-3 ${tone === "warn" ? "border-warn-text/30 bg-warn-soft" : "border-border bg-surface"}`}>
      <span className="text-xs font-bold tracking-wide text-muted uppercase">{label}</span>
      <span className={`text-2xl leading-tight font-bold break-words ${tone === "warn" ? "text-warn-text" : "text-text"}`}>{value}</span>
      {note && <span className="text-sm text-muted">{note}</span>}
    </div>
  );
}

/** A labelled panel on the page. */
export function Panel({ title, note, children, className = "" }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-panel border border-border bg-surface px-5 py-4 ${className}`}>
      <div className="flex flex-col gap-0.5">
        <h3 className="font-bold">{title}</h3>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function Bar({ percent, tone = "accent" }: { percent: number; tone?: "accent" | "warn" | "muted" }) {
  const fill = tone === "warn" ? "bg-warn-text" : tone === "muted" ? "bg-border-strong" : "bg-accent";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-subtle" aria-hidden>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

const BANDS = [
  // Low scores split into 10-point bands too, so a 20% isn't lumped with a 55% (feedback 8502b57c).
  { label: "Under 40%", min: 0 },
  { label: "40s", min: 0.4 },
  { label: "50s", min: 0.5 },
  { label: "60s", min: 0.6 },
  { label: "70s", min: 0.7 },
  { label: "80s", min: 0.8 },
  { label: "90%+", min: 0.9 },
] as const;

/** How many students scored in each band. Exported for tests. */
export function bands(scores: readonly number[]): number[] {
  const counts = BANDS.map(() => 0);
  for (const s of scores) {
    let i = BANDS.length - 1;
    while (i > 0 && s < BANDS[i].min - 1e-9) i -= 1;
    counts[i] += 1;
  }
  return counts;
}

/** The class's scores as columns by band, so the spread shows at a glance. */
export function Histogram({ scores }: { scores: readonly number[] }) {
  const counts = bands(scores);
  const most = Math.max(1, ...counts);
  const said = BANDS.map((b, i) => `${b.label}: ${counts[i]}`).join(", ");
  return (
    <div role="img" aria-label={`Scores: ${said}.`} className="grid grid-cols-5 items-end gap-2 sm:gap-3">
      {BANDS.map((b, i) => (
        <div key={b.label} className="flex min-w-0 flex-col items-center gap-1">
          <span className="text-sm font-bold tabular-nums">{counts[i]}</span>
          <div className="flex h-28 w-full items-end rounded-control bg-subtle">
            <div
              className={`w-full rounded-control ${i === 0 ? "bg-warn-text" : "bg-accent"}`}
              style={{ height: `${counts[i] === 0 ? 0 : Math.max(6, (counts[i] / most) * 100)}%` }}
            />
          </div>
          <span className="text-xs whitespace-nowrap text-muted">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/** A labelled bar per row, with its number on the right. */
export function BarRow({ label, value, percent, tone, badge }: { label: ReactNode; value: ReactNode; percent: number; tone?: "accent" | "warn" | "muted"; badge?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="min-w-0 break-words">
          {label}
          {badge && <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn-text">{badge}</span>}
        </span>
        <span className="text-sm whitespace-nowrap text-muted tabular-nums">{value}</span>
      </div>
      <Bar percent={percent} tone={tone} />
    </div>
  );
}

const SEGMENTS = ["bg-accent", "bg-accent-text/60", "bg-warn-text", "bg-success", "bg-border-strong"];

/** Positions as one bar split by share, with a legend. */
export function StackedBar({ parts, of }: { parts: readonly { label: string; count: number }[]; of: number }) {
  const said = parts.map((p) => `${p.label}: ${p.count} of ${of}`).join(", ");
  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label={said} className="flex h-4 w-full overflow-hidden rounded-full bg-subtle">
        {parts.map((p, i) => (
          <div key={p.label} className={SEGMENTS[i % SEGMENTS.length]} style={{ width: `${share(p.count, of)}%` }} />
        ))}
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-baseline gap-2">
            <span className={`inline-block size-2.5 shrink-0 rounded-full ${SEGMENTS[i % SEGMENTS.length]}`} aria-hidden />
            <span className="min-w-0 flex-1 break-words">{p.label}</span>
            <span className="whitespace-nowrap text-muted tabular-nums">
              {p.count} · {share(p.count, of)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** How many of the class something covers, one dot a student (a bar past 40). */
export function DotRow({ count, of, fill }: { count: number; of: number; fill: string }) {
  if (of > 40) {
    return (
      <div className="h-2 w-full overflow-hidden rounded-full bg-subtle" aria-hidden>
        <div className={`h-full ${fill}`} style={{ width: `${share(count, of)}%` }} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1" aria-hidden>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={`size-2.5 rounded-full ${i < count ? fill : "bg-border"}`} />
      ))}
    </div>
  );
}

/** Who said it (a name only when the teacher shows names) and a link to their conversation. */
export function QuoteLine({ text, name, href }: { text: string | null; name: string | null; href: string }) {
  return (
    <li className="flex flex-col gap-0.5 text-sm">
      {text && <span className="break-words">&ldquo;{text}&rdquo;</span>}
      <span className="text-muted">
        {name ?? "A student"} ·{" "}
        <Link href={href} className="text-accent-text hover:underline">
          Read the conversation
        </Link>
      </span>
    </li>
  );
}

/** A point raised (or a position): its bar, opening to what each student said. */
export function TallyRow({ tally, of, quoteHref, nameOf }: { tally: Tally; of: number; quoteHref: (attemptId: string) => string; nameOf: (attemptId: string) => string | null }) {
  const row = (
    <BarRow
      label={tally.label}
      value={`${tally.students} of ${of} · ${share(tally.students, of)}%`}
      percent={share(tally.students, of)}
      tone={share(tally.students, of) < 50 ? "warn" : "accent"}
      badge={tally.students === 0 ? "Nobody raised it" : undefined}
    />
  );
  if (tally.quotes.length === 0) return row;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
        {row}
        <span className="mt-1 inline-block text-sm text-accent-text group-open:hidden">What they said ▸</span>
      </summary>
      <ul className="mt-3 flex flex-col gap-2 border-l-2 border-border-strong pl-4">
        {tally.quotes.map((q) => (
          <QuoteLine key={q.attemptId} text={q.text} name={nameOf(q.attemptId)} href={quoteHref(q.attemptId)} />
        ))}
      </ul>
    </details>
  );
}

export type TakeawayKind = "confusion" | "strength" | "question";

const KIND: Record<TakeawayKind, { label: string; icon: string; card: string; chip: string; dot: string }> = {
  confusion: { label: "Confusion", icon: "!", card: "border-t-warn-text", chip: "bg-warn-soft text-warn-text", dot: "bg-warn-text" },
  strength: { label: "Strong idea", icon: "★", card: "border-t-success", chip: "bg-subtle text-success", dot: "bg-success" },
  question: { label: "Students asked", icon: "?", card: "border-t-accent", chip: "bg-accent-soft text-accent-text", dot: "bg-accent" },
};

/** One big takeaway: what kind, the headline, how much of the class it covers, and the students' words underneath. */
export function TakeawayCard({
  kind,
  item,
  of,
  quoteHref,
  nameOf,
}: {
  kind: TakeawayKind;
  item: BriefItem;
  of: number;
  quoteHref: (attemptId: string) => string;
  nameOf: (attemptId: string) => string | null;
}) {
  const k = KIND[kind];
  return (
    <article className={`flex min-w-0 flex-col gap-3 rounded-panel border border-t-4 border-border bg-surface px-5 py-4 ${k.card}`}>
      <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-bold ${k.chip}`}>
        <span aria-hidden>{k.icon} </span>
        {k.label}
      </span>
      <h4 className="text-lg leading-snug font-bold text-balance break-words">{item.title}</h4>
      <div className="flex flex-col gap-1.5">
        <DotRow count={item.students} of={of} fill={k.dot} />
        <span className="text-sm text-muted">
          {item.students} of {of} {of === 1 ? "conversation" : "conversations"}
        </span>
      </div>
      <p className="text-sm break-words">{item.detail}</p>
      {item.quotes.length > 0 && (
        <details className="group mt-auto text-sm">
          <summary className="cursor-pointer text-accent-text select-none">What students said</summary>
          <ul className="mt-2 flex flex-col gap-2 border-l-2 border-border-strong pl-4">
            {item.quotes.map((q) => (
              <QuoteLine key={q.attemptId} text={q.text} name={nameOf(q.attemptId)} href={quoteHref(q.attemptId)} />
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
