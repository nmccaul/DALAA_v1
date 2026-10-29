import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { loginIdLabel } from "@/auth/login-id";
import { PageHeader } from "@/components/ui";
import { upcomingTerm } from "@/courses/term";
import { CourseForm } from "./course-form";

export const metadata: Metadata = { title: "Set up a course" };

export default function NewCoursePage() {
  const loginId = loginIdLabel();
  return (
    <>
      <Link href="/courses" className="-mb-4 text-sm text-muted hover:text-text">
        ← All courses
      </Link>
      <PageHeader
        title="Set up a course"
        description={`Students on the class list can sign in with their ${loginId.noun} as soon as you create the course.`}
      />
      <CourseForm
        loginId={loginId}
        initial={{ creationKey: randomUUID(), code: "", title: "", term: upcomingTerm(new Date()), roster: "" }}
      />
    </>
  );
}
