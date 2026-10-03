import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui";
import { PreviewNote } from "@/components/preview-note";
import { loadTaughtCourse } from "@/courses/load";
import { findTool, TOOLS } from "@/tools/catalog";

export async function generateMetadata({ params }: PageProps<"/courses/[courseId]/activities/new/[tool]">): Promise<Metadata> {
  return { title: `New ${findTool((await params).tool)?.name ?? "activity"}` };
}

/**
 * How setting up this tool will work. A walkthrough only: the same five steps
 * every tool will share (PRD §5 steps 6 to 8), with this tool's specifics.
 */
export default async function ToolPreviewPage({ params }: PageProps<"/courses/[courseId]/activities/new/[tool]">) {
  const { courseId, tool: slug } = await params;
  const { course } = await loadTaughtCourse(courseId);
  const tool = findTool(slug);
  if (!tool) notFound();
  const Icon = tool.icon;

  const steps = [
    { title: "Give it your material", body: `${tool.material}. Upload a file or paste text.` },
    { title: "DALAA drafts it", body: `From your material, DALAA writes a first draft: ${tool.draft}. You start from a draft, never a blank page.` },
    { title: "Make it yours", body: "Go through the draft one step at a time and change anything. DALAA explains each part as you go." },
    { title: "Try it as a student", body: "Do the activity exactly as your students will, before anyone sees it." },
    {
      title: "Schedule it",
      body: `Dates start from ${course.term}, and you can give sections their own windows. One switch adds it to your Canvas gradebook with a link students click.`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/courses/${course.id}/activities/new`} className="-mb-2 text-sm text-muted hover:text-text">
        ← All tools
      </Link>
      <div className="flex items-center gap-3">
        <span style={{ color: tool.accent }}>
          <Icon size={32} weight="duotone" aria-hidden />
        </span>
        <h2 className="font-display text-2xl font-semibold tracking-tight">New {tool.name}</h2>
      </div>
      <p className="max-w-[65ch] text-muted">{tool.students}</p>
      <PreviewNote>This is how setting up a {tool.name} will work. It isn&apos;t built yet, so nothing is saved.</PreviewNote>

      <ol className="flex max-w-2xl flex-col gap-0">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: tool.accent }}
              >
                {i + 1}
              </span>
              {i < steps.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className="flex flex-col gap-1 pb-6">
              <h3 className="font-display text-lg font-semibold">{step.title}</h3>
              <p className="text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="flex max-w-2xl flex-col gap-2 rounded-panel border border-border bg-surface p-5">
        <h3 className="font-display text-lg font-semibold">When students finish</h3>
        <p className="text-muted">{tool.teacher} You review the results, and grades go to Canvas only when you click Post grades.</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled title="Coming soon">
          Start {tool.name}
        </Button>
        <span className="text-sm text-muted">Coming soon</span>
      </div>
      <p className="text-sm text-muted">
        Or look at{" "}
        {TOOLS.filter((t) => t.slug !== tool.slug).map((t, i, rest) => (
          <span key={t.slug}>
            <Link href={`/courses/${course.id}/activities/new/${t.slug}`} className="underline hover:text-text">
              {t.name}
            </Link>
            {i < rest.length - 1 ? " or " : ""}
          </span>
        ))}
        .
      </p>
    </div>
  );
}
