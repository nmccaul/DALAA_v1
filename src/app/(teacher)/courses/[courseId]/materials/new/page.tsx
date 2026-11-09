import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { materialReturnPath } from "@/content/return-path";
import { loadTaughtCourse } from "@/courses/load";
import { AddMaterialForm } from "./add-form";
import { WebPageForm } from "./web-form";

export const metadata: Metadata = { title: "Add material" };

const KINDS = { upload: "Upload a file", paste: "Paste text", web: "Add a web page" } as const;

/** + Materials → Upload a file / Paste text / Add a web page. */
export default async function NewMaterialPage({ params, searchParams }: PageProps<"/courses/[courseId]/materials/new">) {
  const { course } = await loadTaughtCourse((await params).courseId);
  const query = await searchParams;
  const kind = query.kind;
  if (kind !== "upload" && kind !== "paste" && kind !== "web") notFound();
  // Opened from a new activity's step 1: Back and Save both return there.
  const next = materialReturnPath(query.next, course.id);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={next ?? `/courses/${course.id}/materials`} className="text-sm text-accent-text hover:underline">
          {next ? "‹ Back to the new activity" : "‹ Materials"}
        </Link>
        <h2 className="text-2xl font-normal">{KINDS[kind]}</h2>
      </div>
      {kind === "web" ? (
        <WebPageForm courseId={course.id} creationKey={randomUUID()} next={next} />
      ) : (
        <AddMaterialForm courseId={course.id} creationKey={randomUUID()} kind={kind} next={next} />
      )}
    </div>
  );
}
