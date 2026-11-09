import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadTaughtCourse } from "@/courses/load";
import { AddMaterialForm } from "./add-form";

export const metadata: Metadata = { title: "Add material" };

const KINDS = { upload: "Upload a file", paste: "Paste text" } as const;

/** + Materials → Upload a file / Paste text. */
export default async function NewMaterialPage({ params, searchParams }: PageProps<"/courses/[courseId]/materials/new">) {
  const { course } = await loadTaughtCourse((await params).courseId);
  const kind = (await searchParams).kind;
  if (kind !== "upload" && kind !== "paste") notFound();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={`/courses/${course.id}/materials`} className="text-sm text-accent-text hover:underline">
          ‹ Materials
        </Link>
        <h2 className="text-2xl font-normal">{KINDS[kind]}</h2>
      </div>
      <AddMaterialForm courseId={course.id} creationKey={randomUUID()} kind={kind} />
    </div>
  );
}
