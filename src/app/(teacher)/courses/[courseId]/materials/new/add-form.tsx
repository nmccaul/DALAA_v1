"use client";

import { useActionState } from "react";
import { capitalize, FILE_ACCEPT, FILE_TYPES_LABEL } from "@/content/file-types";
import { Button, fileInputStyles, inputStyles } from "@/components/ui";
import { addMaterialAction, type AddMaterialState } from "../actions";
import { SeenByField } from "./seen-by";

/** Upload or paste one material, and say who sees it. */
export function AddMaterialForm({ courseId, creationKey, kind, next, nameMax }: { courseId: string; creationKey: string; next: string | null; kind: "upload" | "paste"; nameMax: number }) {
  const [state, action, pending] = useActionState<AddMaterialState, FormData>(addMaterialAction, {});
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="creationKey" value={creationKey} />
      {next && <input type="hidden" name="next" value={next} />}
      {kind === "upload" ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="file" className="font-bold">
            File
          </label>
          <p className="-mt-1 text-sm text-muted">{capitalize(FILE_TYPES_LABEL)}, up to 4 MB. Kept in DALAA, not in Canvas Files.</p>
          <input id="file" name="file" type="file" accept={FILE_ACCEPT} required className={fileInputStyles} />
          <label htmlFor="name" className="mt-3 font-bold">
            Title <span className="font-normal text-muted">(optional)</span>
          </label>
          <p className="-mt-1 text-sm text-muted">What students and you see in lists. Leave it empty to use the file&apos;s name without the .pdf or underscores.</p>
          <input id="name" name="name" maxLength={nameMax} placeholder="Case: Harbor Bikes" autoComplete="off" className={inputStyles} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="font-bold">
              Title
            </label>
            <input id="name" name="name" required placeholder="Case: Harbor Bikes" autoComplete="off" className={inputStyles} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="text" className="font-bold">
              Text
            </label>
            <p className="-mt-1 text-sm text-muted">Notes, a transcript, an excerpt. Use Markdown for a title (# Title), **bold** or lists; you&apos;ll see how it reads next.</p>
            <textarea id="text" name="text" rows={12} required className={inputStyles} />
          </div>
        </>
      )}
      <SeenByField />
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      <div>
        <Button disabled={pending}>{pending ? "Reading…" : "Add and preview"}</Button>
      </div>
    </form>
  );
}
