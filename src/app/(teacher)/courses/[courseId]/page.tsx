import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { assignToCanvasOn } from "@/activities/assign";
import { REMINDER_COOKIE, showsReminder } from "@/activities/draft-reminder";
import { listCourseActivities, listOtherCourseActivities, type ActivityRow, type OtherCourseActivity } from "@/activities/queries";
import { loginIdLabel } from "@/auth/login-id";
import { ActivityMenu } from "@/components/activity-menu";
import { ListSearch, NoMatches, SearchBox, SearchGroup, SearchItem } from "@/components/list-search";
import { LocalTime } from "@/components/local-time";
import { Button, ButtonLink, EmptyState } from "@/components/ui";
import { loadTaughtCourse } from "@/courses/load";
import { keepFrom } from "@/courses/origin";
import { COURSE_MENU_LABEL } from "@/lti/config";
import { db } from "@/db/client";
import { editActivityPath, teacherActivityPath } from "@/tools/catalog";
import { describeActivity } from "@/tools/screens";
import { copyActivityAction } from "./actions";
import { DeleteActivity } from "./delete-activity";
import { DraftReminder } from "./draft-reminder";
import { activitiesView } from "./view";

const pointsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const points = (p: number | null) => (p === null ? "" : ` · ${pointsFormat.format(p)} ${p === 1 ? "pt" : "pts"}`);

/**
 * The Activities tab (D-034): what's assigned in Canvas on top; below it, this
 * course's other activities, or the teacher's activities from their other
 * courses to copy in.
 */
export default async function CourseAssignmentsPage({ params, searchParams }: PageProps<"/courses/[courseId]">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const q = await searchParams;
  const [activities, elsewhere] = await Promise.all([
    listCourseActivities(db(), actor, course.id),
    listOtherCourseActivities(db(), actor, course.id),
  ]);
  const create = <ActivityMenu courseId={course.id} />;

  if (activities.length === 0 && elsewhere.length === 0) {
    const host = (await headers()).get("host") ?? "";
    return (
      <EmptyState title="No activities yet" action={create}>
        <p>
          Choose a type, give it your material, and DALAA drafts the activity for you to edit. Students on your class
          list can already sign in at{" "}
          <span className="font-medium text-text" translate="no">
            {host}/sign-in
          </span>{" "}
          with their {loginIdLabel().noun}.
        </p>
      </EmptyState>
    );
  }

  const assigned = activities.filter((a) => a.assigned);
  const notAssigned = activities.filter((a) => !a.assigned);
  const base = `/courses/${course.id}`;
  const assignOn = assignToCanvasOn();
  const view = activitiesView(q.show, { assigned: assigned.length, notAssigned: notAssigned.length, other: elsewhere.length });
  // Unfinished drafts, so a teacher who stepped away finds them again (feedback 391261a8, b0f7f57b).
  const drafts = notAssigned.filter((a) => a.status === "draft").map((a) => a.id);
  const remind = showsReminder(view, drafts, (await cookies()).get(REMINDER_COOKIE)?.value);
  const views = [
    { key: "assigned", label: "Assigned", count: assigned.length },
    { key: "unassigned", label: "Not assigned", count: notAssigned.length },
    { key: "other", label: "Other courses", wide: "From my other courses", count: elsewhere.length },
  ] as const;

  return (
    <ListSearch className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox placeholder="Search for activity" />
        {create}
      </div>
      <div>
        <nav aria-label="Show activities" className="inline-flex overflow-x-auto rounded-control border border-border-strong text-sm">
          {views.map((v, i) => (
            <Link
              key={v.key}
              href={`${base}?show=${v.key}`}
              aria-current={v.key === view ? "page" : undefined}
              className={`px-2.5 py-2 whitespace-nowrap sm:px-3.5 ${i > 0 ? "border-l border-border-strong" : ""} ${
                v.key === view ? "bg-accent font-bold text-white" : "bg-surface text-accent-text hover:bg-subtle"
              }`}
            >
              {"wide" in v ? (
                <>
                  <span className="sm:hidden">{v.label}</span>
                  <span className="hidden sm:inline">{v.wide}</span>
                </>
              ) : (
                v.label
              )}{" "}
              ({v.count})
            </Link>
          ))}
        </nav>
      </div>
      {remind && <DraftReminder draftIds={drafts} href={`${base}?show=unassigned`} />}
      {q.deleted && (
        <p role="status" className="rounded-control bg-accent-soft px-4 py-3 text-accent-text">
          Activity deleted.
        </p>
      )}
      {q.copyerror && (
        <p role="alert" className="rounded-control border border-border-strong bg-subtle px-4 py-3">
          We couldn&apos;t copy that activity. You can copy only from courses you teach.
        </p>
      )}

      {view === "assigned" ? (
        assigned.length === 0 ? (
          <p className="border border-dashed border-border-strong px-6 py-10 text-muted">
            Nothing is assigned yet. Activities you add to Canvas show up here.
          </p>
        ) : (
          <SearchableList
            rows={assigned}
            noun="assigned activities"
            row={(a) => (
              <CourseRow
                activity={a}
                courseId={course.id}
                actions={
                  <>
                    {assignOn && a.canvasAssignmentId && (
                      <Link href={`${base}/activities/${a.id}/assign`} className="text-sm text-accent-text hover:underline">
                        Change due date
                      </Link>
                    )}
                    <EditButton href={editActivityPath(course.id, a)} />
                    <DeleteActivity activity={a} />
                  </>
                }
              />
            )}
          />
        )
      ) : view === "other" ? (
        <OtherCourses activities={elsewhere} courseId={course.id} />
      ) : notAssigned.length === 0 ? (
        <p className="border border-dashed border-border-strong px-6 py-10 text-muted">
          Everything in this course is assigned. Use + Activity to make another.
        </p>
      ) : (
        <SearchableList
          rows={notAssigned}
          noun="activities"
          row={(a) => (
            <CourseRow
              activity={a}
              courseId={course.id}
              actions={
                <>
                  {assignOn && (
                    <ButtonLink href={`${base}/activities/${a.id}/assign`} className="text-sm">
                      Assign
                    </ButtonLink>
                  )}
                  <EditButton href={editActivityPath(course.id, a)} />
                  <CopyButton activityId={a.id} courseId={course.id} label="Copy" />
                  <DeleteActivity activity={a} />
                </>
              }
            />
          )}
        />
      )}

      <p className="text-sm text-muted">
        {assignOn
          ? "Assign adds an activity to Canvas Assignments, where students open it and where its grade goes."
          : `Published means students can open it once it's in Canvas. To add it, in Canvas go to Assignments → + Assignment → Submission type: External Tool → Find → ${COURSE_MENU_LABEL}, and pick it. It moves to Assigned after the first time someone opens it from there.`}
      </p>
    </ListSearch>
  );
}

/** A bordered list of activities the search box filters, with a note when nothing matches. */
function SearchableList<T extends { id: string; title: string }>({
  rows,
  noun,
  row,
}: {
  rows: readonly T[];
  noun: string;
  row: (activity: T) => ReactNode;
}) {
  const titles = rows.map((a) => a.title);
  return (
    <>
      <SearchGroup texts={titles}>
        <ul className="flex flex-col divide-y divide-border border border-border">
          {rows.map((a) => (
            <SearchItem key={a.id} text={a.title}>
              {row(a)}
            </SearchItem>
          ))}
        </ul>
      </SearchGroup>
      <NoMatches texts={titles} noun={noun} />
    </>
  );
}

function CourseRow({ activity: a, courseId, actions }: { activity: ActivityRow; courseId: string; actions?: ReactNode }) {
  const { label, icon: Icon } = describeActivity(a);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 pr-4 pl-4 hover:bg-subtle">
      {Icon && (
        <span className="shrink-0">
          <Icon size={24} aria-hidden />
        </span>
      )}
      <div className="flex min-w-0 flex-[1_1_260px] flex-col">
        <Link
          href={teacherActivityPath(courseId, a)}
          className="font-bold break-words text-text hover:text-accent hover:underline"
        >
          {a.title}
        </Link>
        <span className="mt-0.5 text-[13px] text-muted">
          {label}
          {points(a.points)}
          {" · "}
          {a.dueAt ? <>Due <LocalTime value={a.dueAt} /></> : "No due date"}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-3.5 gap-y-2">
        <StatusPill status={a.status} />
        <span className="text-right text-sm text-muted">
          {a.status === "published" ? `${a.submitted} submitted · ${a.graded} graded` : "Students can’t see it"}
        </span>
        {a.status === "published" && (
          <Link href={`/courses/${courseId}/grading?assignment=${a.id}`} className="text-sm text-accent-text hover:underline">
            Results
          </Link>
        )}
        {actions}
      </div>
    </li>
  );
}

/** The teacher's other courses' activities, one list per course, each with "Copy to this course". */
function OtherCourses({ activities, courseId }: { activities: OtherCourseActivity[]; courseId: string }) {
  if (activities.length === 0) {
    return (
      <p className="border border-dashed border-border-strong px-6 py-10 text-muted">
        Activities from your other courses show up here, ready to copy into this one.
      </p>
    );
  }
  const groups = new Map<string, OtherCourseActivity[]>();
  for (const a of activities) groups.set(a.courseId, [...(groups.get(a.courseId) ?? []), a]);
  return (
    <div className="flex flex-col gap-4">
      {[...groups.values()].map((rows) => (
        <SearchGroup key={rows[0].courseId} texts={rows.map((a) => a.title)}>
          <section className="border border-border">
            <h2 className="border-b border-border bg-subtle px-4 py-2.5 text-base font-bold">
              {rows[0].courseCode} <span className="font-normal text-muted">· {rows[0].courseTerm}</span>
            </h2>
            <ul className="flex flex-col divide-y divide-border">
              {rows.map((a) => {
                const { label, icon: Icon } = describeActivity(a);
                return (
                  <SearchItem key={a.id} text={a.title}>
                    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 pr-4 pl-4 hover:bg-subtle">
                      {Icon && (
                        <span className="shrink-0">
                          <Icon size={24} aria-hidden />
                        </span>
                      )}
                      <div className="flex min-w-0 flex-[1_1_260px] flex-col">
                        <Link
                          href={keepFrom(`/courses/${a.courseId}/activities/${a.id}`, courseId)}
                          className="font-bold break-words text-text hover:text-accent hover:underline"
                        >
                          {a.title}
                        </Link>
                        <span className="mt-0.5 text-[13px] text-muted">
                          {label}
                          {points(a.points)}
                          {" · Last edit "}
                          <LocalTime value={a.updatedAt} style="day" />
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-3.5">
                        <StatusPill status={a.status} />
                        {a.copiedAt && (
                          // Already copied here (feedback f7026325); copying again stays possible.
                          <span className="text-[13px] font-bold whitespace-nowrap text-accent-text">
                            ✓ Copied <LocalTime value={a.copiedAt} style="day" />
                          </span>
                        )}
                        <CopyButton
                          activityId={a.id}
                          courseId={courseId}
                          label={a.copiedAt ? "Copy again" : "Copy to this course"}
                        />
                      </div>
                    </li>
                  </SearchItem>
                );
              })}
            </ul>
          </section>
        </SearchGroup>
      ))}
      <NoMatches texts={activities.map((a) => a.title)} noun="activities in your other courses" />
    </div>
  );
}

function StatusPill({ status }: { status: "draft" | "published" }) {
  return status === "published" ? (
    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] font-bold whitespace-nowrap text-accent-text">
      Published
    </span>
  ) : (
    <span className="rounded-full border border-dashed border-muted bg-surface px-2.5 py-0.5 text-[13px] font-bold whitespace-nowrap text-muted">
      Draft
    </span>
  );
}

/** Opens the activity in the creation wizard (its setup steps) to change it. */
function EditButton({ href }: { href: string }) {
  return (
    <ButtonLink href={href} variant="secondary" className="text-sm">
      Edit
    </ButtonLink>
  );
}

/** Copies the activity into this course as a draft and opens the copy. */
function CopyButton({ activityId, courseId, label }: { activityId: string; courseId: string; label: string }) {
  return (
    <form action={copyActivityAction}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="creationKey" value={randomUUID()} />
      <Button variant="secondary" className="text-sm">
        {label}
      </Button>
    </form>
  );
}
