import { headers } from "next/headers";
import { EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";

export default async function CourseActivitiesPage({ params }: PageProps<"/courses/[courseId]">) {
  await loadTaughtCourse((await params).courseId);
  const host = (await headers()).get("host") ?? "";

  return (
    <EmptyState title="No activities yet">
      <p>
        Activities such as Case Chat and quizzes will be created here once the first tool is ready.
        Students on your class list can already sign in at{" "}
        <span className="font-medium text-text" translate="no">
          {host}/sign-in
        </span>{" "}
        with their NetID.
      </p>
    </EmptyState>
  );
}
