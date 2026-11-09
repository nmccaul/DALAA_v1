import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { ButtonLink, EmptyState } from "@/components/ui";
import { listCourseMaterials, SOURCE_LABEL } from "@/content/materials";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";

export const metadata: Metadata = { title: "Materials" };

/** The course's Materials tab (D-032): readings and AI-only notes its activities use. */
export default async function MaterialsPage({ params }: PageProps<"/courses/[courseId]/materials">) {
  const { actor, course } = await loadTaughtCourse((await params).courseId);
  const base = `/courses/${course.id}`;
  const materials = await listCourseMaterials(db(), actor, course.id);
  const add = (
    <ButtonLink href={`${base}/content/canvas?next=${encodeURIComponent(`${base}/materials`)}`}>
      + Add from Canvas
    </ButtonLink>
  );

  if (materials.length === 0) {
    return (
      <EmptyState title="No materials yet" action={add}>
        <p>
          Materials are the readings and notes your activities use. Add a Canvas page or file here, or upload or paste one
          while you create an activity.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{add}</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr className="border-b-2 border-border-strong text-left">
              <th className="px-3 py-2.5 font-bold">Title</th>
              <th className="px-3 py-2.5 font-bold whitespace-nowrap">Seen by</th>
              <th className="px-3 py-2.5 font-bold whitespace-nowrap">Used in</th>
              <th className="px-3 py-2.5 font-bold whitespace-nowrap">Added</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={`${m.seenBy}-${m.id}`} className="border-b border-border align-top">
                <td className="px-3 py-3">
                  <span className="font-bold break-words">{m.name}</span>
                  <span className="block text-[13px] text-muted">{SOURCE_LABEL[m.source]}</span>
                </td>
                <td className="px-3 py-3">
                  {m.seenBy === "students" ? (
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-accent-text">
                      Students + AI
                    </span>
                  ) : (
                    <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-warn-text">
                      AI only
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {m.usedIn.length === 0 ? (
                    <span className="text-muted">Not used yet</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {m.usedIn.map((a) => (
                        <li key={a.id}>
                          <Link href={`${base}/activities/${a.id}`} className="text-accent-text hover:underline">
                            {a.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-muted">
                  <LocalTime value={m.createdAt} style="day" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">
        Students see a material only inside an activity that uses it. AI-only materials never reach students.
      </p>
    </div>
  );
}
