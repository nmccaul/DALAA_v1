import type { Metadata } from "next";
import Link from "next/link";
import { loadTaughtCourse } from "@/courses/load";
import { keepPicker, PICKER_PARAM, pickerRequest } from "@/lti/picker";
import { isLive, TOOLS } from "@/tools/catalog";

export const metadata: Metadata = { title: "Create assignment" };

/** Step 1 of a new assignment: which type? (PRD §5 step 5) */
export default async function NewActivityPage({ params, searchParams }: PageProps<"/courses/[courseId]/activities/new">) {
  const { course } = await loadTaughtCourse((await params).courseId);
  const picker = pickerRequest((await searchParams)[PICKER_PARAM]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight">What kind of assignment?</h2>
        <p className="text-muted">Each type works differently for students, and they all take the same steps to set up.</p>
      </div>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const live = isLive(tool);
          const card = (
            <>
              <span className="flex items-center gap-3">
                <span style={{ color: tool.accent }}>
                  <Icon size={28} weight="duotone" aria-hidden />
                </span>
                <span className="font-display text-xl font-semibold">{tool.name}</span>
                {!live && (
                  <span className="ml-auto rounded-control bg-bg px-2 py-0.5 text-xs font-medium text-muted">Coming soon</span>
                )}
              </span>
              <span className="text-text">{tool.students}</span>
              <span className="mt-auto flex flex-col gap-1 border-t border-border pt-4 text-sm">
                <span className="font-medium text-muted">You get</span>
                <span>{tool.teacher}</span>
              </span>
              {live && <span className="text-sm font-medium text-accent-text group-hover:underline">Start a {tool.name} →</span>}
            </>
          );
          const cardStyles = "flex h-full flex-col gap-4 rounded-panel border border-border bg-surface p-6";
          return (
            <li key={tool.slug}>
              {live ? (
                <Link
                  href={keepPicker(`/courses/${course.id}/activities/new/${tool.slug}`, picker)}
                  className={`group ${cardStyles} transition-colors hover:border-border-strong`}
                  style={{ borderTopColor: tool.accent, borderTopWidth: 4 }}
                >
                  {card}
                </Link>
              ) : (
                <div className={`${cardStyles} text-muted`} aria-disabled>
                  {card}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-muted">
        Already made an assignment in another course? Reuse it from your{" "}
        <Link href="/library" className="underline hover:text-text">
          Library
        </Link>
        .
      </p>
    </div>
  );
}
