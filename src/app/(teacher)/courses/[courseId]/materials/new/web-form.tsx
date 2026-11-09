"use client";

import { useActionState, useState } from "react";
import { Button, inputStyles } from "@/components/ui";
import { addWebPageAction, type WebPageState } from "../actions";
import { SeenByField } from "./seen-by";

/** Add a web page: Fetch shows a preview of the saved text; Add this page saves the copy. */
export function WebPageForm({ courseId, creationKey }: { courseId: string; creationKey: string }) {
  const [state, action, pending] = useActionState<WebPageState, FormData>(addWebPageAction, {});
  const [url, setUrl] = useState("");
  const preview = state.preview && state.preview.url.replace(/\/$/, "") === url.trim().replace(/\/$/, "") ? state.preview : null;

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="creationKey" value={creationKey} />
      {preview && <input type="hidden" name="confirm" value="1" />}
      <div className="flex flex-col gap-2">
        <label htmlFor="url" className="font-bold">
          Address
        </label>
        <p className="-mt-1 text-sm text-muted">
          DALAA saves a copy of the page&apos;s text, so the activity still works if the page changes.
        </p>
        <input
          id="url"
          name="url"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          autoComplete="off"
          className={inputStyles}
        />
      </div>
      {preview && (
        <section aria-label="Preview of the saved text" className="flex flex-col gap-2 border border-border bg-subtle px-4 py-3">
          <span className="text-sm text-muted">Preview of the saved text</span>
          <span className="font-bold break-words">{preview.title}</span>
          <p className="text-sm whitespace-pre-wrap break-words">
            {preview.excerpt}
            {preview.excerpt.length >= 600 && "…"}
          </p>
        </section>
      )}
      {preview && <SeenByField />}
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      <div>
        <Button disabled={pending}>{pending ? "Fetching…" : preview ? "Add this page" : "Fetch"}</Button>
      </div>
    </form>
  );
}
