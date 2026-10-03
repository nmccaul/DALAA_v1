import type { Metadata } from "next";
import Link from "next/link";
import { PreviewNote } from "@/components/preview-note";
import { loadTaughtCourse } from "@/courses/load";
import { TOOLS } from "@/tools/catalog";

export const metadata: Metadata = { title: "New activity" };

/** Step 1 of a new activity: what should students do? (PRD §5 step 5) */
export default async function NewActivityPage({ params }: PageProps<"/courses/[courseId]/activities/new">) {
  const { course } = await loadTaughtCourse((await params).courseId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight">What should your students do?</h2>
        <p className="text-muted">Pick a tool. Each one has its own way of working, and they all share the same steps to set up.</p>
      </div>
      <PreviewNote>The tools aren&apos;t built yet. Pick one to see how setting it up will work. Nothing is created.</PreviewNote>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <li key={tool.slug}>
              <Link
                href={`/courses/${course.id}/activities/new/${tool.slug}`}
                className="group flex h-full flex-col gap-4 rounded-panel border border-border bg-surface p-6 transition-colors hover:border-border-strong"
                style={{ borderTopColor: tool.accent, borderTopWidth: 4 }}
              >
                <span className="flex items-center gap-3">
                  <span style={{ color: tool.accent }}>
                    <Icon size={28} weight="duotone" aria-hidden />
                  </span>
                  <span className="font-display text-xl font-semibold">{tool.name}</span>
                </span>
                <span className="text-text">{tool.students}</span>
                <span className="mt-auto flex flex-col gap-1 border-t border-border pt-4 text-sm">
                  <span className="font-medium text-muted">You get</span>
                  <span>{tool.teacher}</span>
                </span>
                <span className="text-sm font-medium text-accent-text group-hover:underline">See how it works →</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-muted">
        Already made an activity in another course? Reuse it from your{" "}
        <Link href="/library" className="underline hover:text-text">
          Library
        </Link>
        .
      </p>
    </div>
  );
}
