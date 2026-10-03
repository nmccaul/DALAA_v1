import { headers } from "next/headers";
import { ButtonLink, EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";

export default async function CourseActivitiesPage({ params }: PageProps<"/courses/[courseId]">) {
  const { course } = await loadTaughtCourse((await params).courseId);
  const host = (await headers()).get("host") ?? "";

  return (
    <EmptyState
      title="No activities yet"
      action={<ButtonLink href={`/courses/${course.id}/activities/new`}>New activity</ButtonLink>}
    >
      <p>
        Choose a tool, give it your material, and DALAA drafts the activity for you to edit. Students on your
        class list can already sign in at{" "}
        <span className="font-medium text-text" translate="no">
          {host}/sign-in
        </span>{" "}
        with their NetID.
      </p>
    </EmptyState>
  );
}
