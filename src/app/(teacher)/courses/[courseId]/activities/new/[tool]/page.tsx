import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadTaughtCourse } from "@/courses/load";
import { findTool, isLive } from "@/tools/catalog";
import { screensFor } from "@/tools/screens";

export async function generateMetadata({ params }: PageProps<"/courses/[courseId]/activities/new/[tool]">): Promise<Metadata> {
  return { title: `New ${findTool((await params).tool)?.name ?? "assignment"}` };
}

/** Setting up a new assignment of one type: the tool's own create screen (src/tools/screens.ts). */
export default async function NewToolActivityPage({ params, searchParams }: PageProps<"/courses/[courseId]/activities/new/[tool]">) {
  const { courseId, tool: slug } = await params;
  const { actor, course } = await loadTaughtCourse(courseId);
  const tool = findTool(slug);
  const screens = screensFor(slug);
  if (!tool || !isLive(tool) || !screens) notFound();
  const Icon = tool.icon;
  const Create = screens.create;

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/courses/${course.id}/activities/new`} className="-mb-2 text-sm text-muted hover:text-text">
        ← All types
      </Link>
      <div className="flex items-center gap-3">
        <span style={{ color: tool.accent }}>
          <Icon size={32} weight="duotone" aria-hidden />
        </span>
        <h2 className="font-display text-2xl font-semibold tracking-tight">New {tool.name}</h2>
      </div>
      <Create actor={actor} course={course} searchParams={await searchParams} />
    </div>
  );
}
