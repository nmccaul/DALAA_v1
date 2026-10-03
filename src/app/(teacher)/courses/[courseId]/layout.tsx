import Link from "next/link";
import { PracticeTag } from "@/components/practice-tag";
import { Tabs } from "@/components/tabs";
import { loadTaughtCourse } from "@/courses/load";

export default async function CourseLayout({ children, params }: LayoutProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  const { course } = await loadTaughtCourse(courseId);
  const base = `/courses/${course.id}`;

  return (
    <>
      <div className="flex flex-col gap-4">
        <Link href="/courses" className="text-sm text-muted hover:text-text">
          ← All courses
        </Link>
        <header className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-medium text-muted">
            {course.code}
            {course.isPractice && <PracticeTag />}
          </span>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-balance break-words">
            {course.title}
          </h1>
          <p className="text-muted">
            {course.term}, {course.students} {course.students === 1 ? "student" : "students"}
          </p>
        </header>
        <div className="border-b border-border pb-2">
          <Tabs
            label="Course"
            tabs={[
              { href: base, label: "Activities", exact: true, also: [`${base}/activities`] },
              { href: `${base}/students`, label: "Students" },
              { href: `${base}/results`, label: "Results" },
            ]}
          />
        </div>
      </div>
      {children}
    </>
  );
}
