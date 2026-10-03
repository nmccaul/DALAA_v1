import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { upcomingTerm } from "@/courses/term";
import { CourseForm } from "./course-form";

export const metadata: Metadata = { title: "Set up a course" };

export default function NewCoursePage() {
  return (
    <>
      <Link href="/courses" className="-mb-4 text-sm text-muted hover:text-text">
        ← All courses
      </Link>
      <PageHeader
        title="Set up a course"
        description="Students on the class list can sign in with their NetID as soon as you create the course."
      />
      <CourseForm
        initial={{ creationKey: randomUUID(), code: "", title: "", term: upcomingTerm(new Date()), roster: "" }}
      />
    </>
  );
}
