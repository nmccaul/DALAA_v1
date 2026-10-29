import { EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";

export default async function CourseGradingPage({ params }: PageProps<"/courses/[courseId]/grading">) {
  await loadTaughtCourse((await params).courseId);
  return (
    <EmptyState title="Nothing to grade yet">
      <p>
        When students finish an assignment, you&apos;ll see each one&apos;s score here, can change it, and send grades
        to Canvas when you&apos;re ready.
      </p>
    </EmptyState>
  );
}
