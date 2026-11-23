import { redirect } from "next/navigation";
import { gradebookPath } from "../../view";

/** A student's chat and grade opens beside the Gradebook now (D-046); old links land there. */
export default async function AttemptPage({ params, searchParams }: PageProps<"/courses/[courseId]/grading/attempts/[attemptId]">) {
  const { courseId, attemptId } = await params;
  const { from } = await searchParams;
  redirect(gradebookPath(courseId, { open: attemptId, from: from === "insights" ? "insights" : undefined }));
}
