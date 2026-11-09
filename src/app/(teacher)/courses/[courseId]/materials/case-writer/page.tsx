import type { Metadata } from "next";
import Link from "next/link";
import { PreviewNote } from "@/components/preview-note";
import { loadTaughtCourse } from "@/courses/load";

export const metadata: Metadata = { title: "Case Writer" };

/** + Materials → Write a case with Case Writer. Not built yet; says so. */
export default async function CaseWriterPage({ params }: PageProps<"/courses/[courseId]/materials/case-writer">) {
  const { course } = await loadTaughtCourse((await params).courseId);
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={`/courses/${course.id}/materials`} className="text-sm text-accent-text hover:underline">
          ‹ Materials
        </Link>
        <h2 className="text-2xl font-normal">Case Writer</h2>
      </div>
      <PreviewNote>
        Coming later: AI helps you write a case and its teaching note from your sources. The case becomes a material
        students and the AI read; the teaching note is AI-only.
      </PreviewNote>
      <p>
        For now, paste or upload a case you already have from{" "}
        <Link href={`/courses/${course.id}/materials/new?kind=paste`} className="text-accent-text hover:underline">
          Paste text
        </Link>
        .
      </p>
    </div>
  );
}
