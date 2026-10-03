import { EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";

export default async function CourseResultsPage({ params }: PageProps<"/courses/[courseId]/results">) {
  await loadTaughtCourse((await params).courseId);
  return (
    <EmptyState title="No results yet">
      <p>When students finish an activity, you&apos;ll see how the class did here, and each student&apos;s work.</p>
    </EmptyState>
  );
}
