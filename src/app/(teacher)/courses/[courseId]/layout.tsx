import Link from "next/link";
import { inFrame } from "@/components/embed";
import { PracticeTag } from "@/components/practice-tag";
import { Tabs } from "@/components/tabs";
import { loadTaughtCourse } from "@/courses/load";

/**
 * A course's tabs, Canvas-style (D-032). Inside Canvas the breadcrumb and
 * course name are Canvas's own, so only the tabs show; on its own DALAA
 * draws a Canvas-like breadcrumb.
 */
export default async function CourseLayout({ children, params }: LayoutProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  const { course } = await loadTaughtCourse(courseId);
  const base = `/courses/${course.id}`;
  const framed = await inFrame();

  return (
    <>
      {!framed && (
        <div className="-mx-4 -mt-6 flex flex-col gap-1 border-b border-border-strong px-4 py-3.5 sm:-mx-8 sm:px-8">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2.5 text-base">
            <Link href="/courses" className="text-accent-text hover:text-accent hover:underline">
              Courses
            </Link>
            <span aria-hidden className="text-muted">
              ›
            </span>
            <span className="flex items-center gap-2">
              {course.code || course.title}
              {course.isPractice && <PracticeTag />}
            </span>
          </nav>
          <p className="text-sm text-muted">
            {course.title} · {course.term}, {course.students} {course.students === 1 ? "student" : "students"}
          </p>
        </div>
      )}
      <div className="border-b border-border-strong">
        <Tabs
          label="Course"
          tabs={[
            {
              href: base,
              label: "Assigned Activities",
              exact: true,
              also: [`${base}/activities`, `${base}/add-to-canvas`],
            },
            { href: `${base}/materials`, label: "Materials", also: [`${base}/content`] },
            { href: `${base}/grading`, label: "Results" },
            { href: `${base}/dalaa`, label: "DALAA", also: [`${base}/students`, `${base}/canvas`] },
          ]}
        />
      </div>
      {children}
    </>
  );
}
