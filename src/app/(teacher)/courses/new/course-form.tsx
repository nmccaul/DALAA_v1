"use client";

import { useActionState } from "react";
import { Button, inputStyles } from "@/components/ui";
import { setUpCourse, type Fields, type SetUpState } from "./actions";

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="-mt-1 text-sm text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function CourseForm({ initial }: { initial: Fields }) {
  const [state, action, pending] = useActionState<SetUpState, FormData>(setUpCourse, { fields: initial });
  const { fields, errors = {}, problems } = state;
  const described = (id: string, hint?: boolean) =>
    [hint && `${id}-hint`, errors[id as keyof typeof errors] && `${id}-error`].filter(Boolean).join(" ") || undefined;

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="creationKey" value={fields.creationKey} />

      <div className="grid gap-6 sm:grid-cols-[1fr_2fr]">
        <Field id="code" label="Course code" error={errors.code}>
          <input id="code" name="code" defaultValue={fields.code} required autoComplete="off"
            aria-invalid={!!errors.code} aria-describedby={described("code")} className={inputStyles} />
        </Field>
        <Field id="title" label="Course title" error={errors.title}>
          <input id="title" name="title" defaultValue={fields.title} required autoComplete="off"
            aria-invalid={!!errors.title} aria-describedby={described("title")} className={inputStyles} />
        </Field>
      </div>

      <Field id="term" label="Term" error={errors.term}>
        <input id="term" name="term" defaultValue={fields.term} required autoComplete="off"
          aria-invalid={!!errors.term} aria-describedby={described("term")} className={`${inputStyles} sm:max-w-xs`} />
      </Field>

      <Field
        id="roster"
        label="Class list"
        hint="Paste from a spreadsheet: one student per line with NetID, then name, then section if you have sections."
        error={errors.roster}
      >
        <textarea id="roster" name="roster" defaultValue={fields.roster} rows={8} spellCheck={false}
          aria-invalid={!!errors.roster} aria-describedby={described("roster", true)}
          className={`${inputStyles} font-mono text-sm`} />
        <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
          Or add a CSV file:
          <input type="file" name="rosterFile" accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="text-sm file:mr-3 file:rounded-control file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text hover:file:bg-accent-soft" />
        </label>
      </Field>

      {problems && problems.length > 0 && (
        <section role="alert" className="flex flex-col gap-3 rounded-panel border border-danger/40 bg-danger-soft p-5">
          <h2 className="font-display text-lg font-semibold">
            {problems.length === 1 ? "1 line needs a look" : `${problems.length} lines need a look`}
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {problems.map((p) => (
              <li key={p.line}>
                <span className="font-medium">Line {p.line}:</span> {p.reason}{" "}
                <span className="break-all font-mono text-muted">({p.text})</span>
              </li>
            ))}
          </ul>
          <p className="text-sm">Fix them in the list above, or create the course without them. You can add those students later.</p>
          <div>
            <Button type="submit" name="skipProblems" value="1" variant="secondary" disabled={pending}>
              Create without these lines
            </Button>
          </div>
        </section>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating course…" : "Create course"}
        </Button>
      </div>
    </form>
  );
}
