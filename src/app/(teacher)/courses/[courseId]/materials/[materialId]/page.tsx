import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { SeenByPill } from "@/components/seen-by-pill";
import { ButtonLink } from "@/components/ui";
import { getMaterial, NAME_MAX } from "@/content/material";
import { SOURCE_LABEL } from "@/content/material-sources";
import { PdfPages } from "@/content/pdf-pages";
import { loadTaughtCourse } from "@/courses/load";
import { db } from "@/db/client";
import { MaterialEditor } from "./material-editor";

export const metadata: Metadata = { title: "Material" };

/**
 * One material (feedback 8697eb90, D-043): read it the way students do (a PDF
 * as its pages), see where it's used, and edit its name and text beside a
 * live preview. AI-only notes too, marked as never reaching students.
 */
export default async function MaterialPage({ params, searchParams }: PageProps<"/courses/[courseId]/materials/[materialId]">) {
  const { courseId, materialId } = await params;
  const { actor, course } = await loadTaughtCourse(courseId);
  const material = await getMaterial(db(), actor, course.id, materialId);
  if (!material) notFound();
  const q = await searchParams;
  const editing = q.edit === "1";
  const base = `/courses/${course.id}/materials`;
  const here = `${base}/${material.id}`;
  const live = material.usedIn.filter((a) => a.published);
  const text = <div className="max-w-[70ch] text-[1.0625rem] leading-relaxed break-words whitespace-pre-wrap">{material.body}</div>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href={base} className="self-start text-sm text-accent-text hover:underline">
          ‹ Materials
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="min-w-0 text-2xl font-normal text-balance break-words">{material.name}</h2>
          {!editing && (
            <ButtonLink href={`${here}?edit=1`} variant="secondary">
              Edit
            </ButtonLink>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <SeenByPill seenBy={material.seenBy} />
          <span>{SOURCE_LABEL[material.source]}</span>
          <span>
            Added <LocalTime value={material.createdAt} style="day" />
            {material.updatedAt && (
              <>
                {" · "}edited <LocalTime value={material.updatedAt} style="day" />
              </>
            )}
          </span>
          {material.url && (
            <a href={material.url} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
              Open the web page
            </a>
          )}
        </p>
        <p className="text-sm text-muted">
          {material.usedIn.length === 0 ? (
            "Not used in an activity yet."
          ) : (
            <>
              Used in{" "}
              {material.usedIn.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ", "}
                  <Link href={`/courses/${course.id}/activities/${a.id}`} className="text-accent-text hover:underline">
                    {a.title}
                  </Link>
                  {!a.published && " (draft)"}
                </span>
              ))}
            </>
          )}
        </p>
      </div>

      {q.saved && !editing && (
        <p role="status" className="rounded-control bg-accent-soft px-4 py-3 text-accent-text">
          Saved.
          {live.length > 0 &&
            (material.seenBy === "ai"
              ? " The AI uses the new version from the next message on."
              : " Students see the new version the next time they open it.")}
        </p>
      )}

      {editing ? (
        <MaterialEditor
          courseId={course.id}
          id={material.id}
          name={material.name}
          body={material.body}
          cancel={here}
          nameMax={NAME_MAX}
          previewLabel={material.seenBy === "ai" ? "What the AI reads" : "How students read it"}
          notes={[
            ...(material.seenBy === "ai" ? ["Only the AI reads this; students never see it."] : []),
            ...(material.hasFile
              ? ["Students see this PDF's pages as uploaded. You're editing its text: what the AI reads, and what students see under \"Show as text\"."]
              : []),
            ...(live.length > 0
              ? [
                  material.seenBy === "ai"
                    ? `Students can already open ${live.map((a) => `"${a.title}"`).join(", ")}: the AI uses your changes from the next message on.`
                    : `Students can already open ${live.map((a) => `"${a.title}"`).join(", ")}: they'll see your changes right away.`,
                ]
              : []),
          ]}
        />
      ) : (
        <article className="flex flex-col gap-3 rounded-panel border border-border bg-surface px-5 py-5 sm:px-8">
          {material.seenBy === "ai" && <p className="text-sm text-muted">Only the AI reads this note; students never see it.</p>}
          {material.hasFile ? <PdfPages src={`/api/courses/${course.id}/materials/${material.id}/file`} name={material.name} text={text} /> : text}
        </article>
      )}
    </div>
  );
}
