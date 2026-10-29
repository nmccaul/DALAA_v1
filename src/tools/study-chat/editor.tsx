"use client";

import { useActionState, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Button, inputStyles } from "@/components/ui";
import { saveSettingsAction, type FormState } from "./actions";
import { FIELDS, fieldId } from "./fields";
import { PickerField } from "./forms";
import { rubricPoints, settingTitle, STRICTNESS, type StudyChatSettings } from "./schema";

type S = StudyChatSettings;
type Item = { label: string; description: string };

const HELPFULNESS = { challenging: "Challenging", balanced: "Balanced", supportive: "Supportive" } as const;
const STRICTNESS_LABELS = { strict: "Strict", balanced: "Balanced", lenient: "Lenient" } as const;

type CardKey = "goal" | "scenarios" | "positions" | "touchpoints" | "persona" | "completion" | "rubric";
type EditorState = FormState & { snapshot?: string };

function endings(c: S["completion"]): string[] {
  return [
    c.maxTurns !== null && `After ${c.maxTurns} student ${c.maxTurns === 1 ? "message" : "messages"}`,
    c.timeLimitMinutes !== null && `After ${c.timeLimitMinutes} minutes`,
    c.question !== null && `Once the student answers: “${c.question}”`,
    c.studentCanFinish && "When the student chooses to end it",
  ].filter((e): e is string => typeof e === "string");
}

function Items({ items, none }: { items: Item[]; none: string }) {
  if (items.length === 0) return <p className="text-muted">{none}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, i) => (
        <li key={i}>
          <span className="font-medium">{item.label}</span>: {item.description}
        </li>
      ))}
    </ul>
  );
}

function Field({ path, label, children }: { path: string[]; label?: string; children: (id: string) => ReactNode }) {
  const id = fieldId(path);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label ?? settingTitle(path)}
      </label>
      {children(id)}
    </div>
  );
}

const text = (value: string, set: (v: string) => void, rows?: number) =>
  function TextInput(id: string) {
    return rows ? (
      <textarea id={id} rows={rows} value={value} onChange={(e) => set(e.target.value)} className={inputStyles} />
    ) : (
      <input id={id} value={value} onChange={(e) => set(e.target.value)} className={inputStyles} autoComplete="off" />
    );
  };

/** A number where empty means "no limit" (NULL, never 0). */
const limit = (value: number | null, set: (v: number | null) => void) =>
  function LimitInput(id: string) {
    return (
      <input
        id={id}
        type="number"
        min={1}
        placeholder="No limit"
        value={value ?? ""}
        onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}
        className={`${inputStyles} max-w-40`}
      />
    );
  };

function ItemsEditor({ path, items, max, onChange }: { path: string[]; items: Item[]; max: number; onChange: (items: Item[]) => void }) {
  const set = (i: number, item: Item) => onChange(items.map((old, j) => (j === i ? item : old)));
  return (
    <div id={fieldId(path)} tabIndex={-1} className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-control border border-border p-3">
          <Field path={[...path, String(i), "label"]} label={settingTitle([...path, "label"])}>
            {text(item.label, (label) => set(i, { ...item, label }))}
          </Field>
          <Field path={[...path, String(i), "description"]} label={settingTitle([...path, "description"])}>
            {text(item.description, (description) => set(i, { ...item, description }), 2)}
          </Field>
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="self-start text-sm text-danger underline">
            Remove
          </button>
        </div>
      ))}
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, { label: "", description: "" }])} className="self-start text-sm font-medium text-accent-text underline">
          Add one
        </button>
      )}
    </div>
  );
}

/**
 * The review screen's body: one short summary card per part of the chat, each
 * opening to edit it, a search box that jumps to any setting, then Save draft
 * and Publish. Everything is checked against the schema on the server.
 */
export function StudyChatEditor({
  courseId,
  activityId,
  published,
  initial,
  addToCanvas,
}: {
  courseId: string;
  activityId: string;
  published: boolean;
  initial: S;
  addToCanvas: string | null;
}) {
  const [s, setS] = useState(initial);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [state, action, pending] = useActionState<EditorState, FormData>(
    async (prev, form) => ({
      ...(await saveSettingsAction(prev, form)),
      snapshot: String(form.get("settings")),
    }),
    {},
  );

  const json = JSON.stringify(s);
  const savedJson = state.savedAt ? state.snapshot : JSON.stringify(initial);
  const change = (edit: (draft: S) => void) =>
    setS((prev) => {
      const next = structuredClone(prev);
      edit(next);
      return next;
    });
  const toggle = (key: string, isOpen: boolean) =>
    setOpen((prev) => (prev.has(key) === isOpen ? prev : isOpen ? new Set(prev).add(key) : new Set([...prev].filter((k) => k !== key))));

  const q = query.trim().toLowerCase();
  const matches = q
    ? FIELDS.map((f) => ({ ...f, label: `${settingTitle([f.path[0]])} › ${settingTitle(f.path)}` })).filter((f) => f.label.toLowerCase().includes(q))
    : [];
  const jump = (f: (typeof FIELDS)[number]) => {
    flushSync(() => setOpen((prev) => new Set([...prev, f.path[0], ...(f.more ? [`${f.path[0]}:more`] : [])])));
    const el = document.getElementById(fieldId(f.path));
    el?.scrollIntoView({ block: "center" });
    el?.focus();
    setQuery("");
  };

  const card = (key: CardKey, summary: ReactNode, body: ReactNode, more?: ReactNode) => (
    <details
      key={key}
      open={open.has(key)}
      onToggle={(e) => toggle(key, e.currentTarget.open)}
      className="rounded-panel border border-border bg-surface"
    >
      <summary className="flex cursor-pointer list-none flex-col gap-2 p-5 [&::-webkit-details-marker]:hidden">
        <span className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-lg font-semibold">{key === "rubric" ? `${settingTitle([key])}: ${rubricPoints(s)} points` : settingTitle([key])}</h3>
          <span className="shrink-0 text-sm text-accent-text underline">{open.has(key) ? "Close" : "Edit"}</span>
        </span>
        <span className="flex flex-col gap-2 text-sm">{summary}</span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-5">
        {body}
        {more && (
          <details open={open.has(`${key}:more`)} onToggle={(e) => toggle(`${key}:more`, e.currentTarget.open)}>
            <summary className="cursor-pointer text-sm font-medium text-muted">More options</summary>
            <div className="mt-3 flex flex-col gap-4">{more}</div>
          </details>
        )}
      </div>
    </details>
  );

  const scenario = s.scenarios[0];
  return (
    <form
      action={action}
      // Enter in a one-line field must not publish.
      onKeyDown={(e) => e.key === "Enter" && e.target instanceof HTMLInputElement && e.preventDefault()}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="settings" value={json} />
      <PickerField addToCanvas={addToCanvas} />

      <div className="relative max-w-md">
        <label htmlFor="setting-search" className="sr-only">
          Find a setting
        </label>
        <input
          id="setting-search"
          type="search"
          placeholder="Find a setting, e.g. time limit"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches[0]) jump(matches[0]);
            }
          }}
          className={inputStyles}
          autoComplete="off"
        />
        {q && (
          <ul className="absolute z-10 mt-1 flex w-full flex-col rounded-control border border-border bg-surface py-1 shadow-sm">
            {matches.length === 0 && <li className="px-3 py-2 text-sm text-muted">No setting matches “{query.trim()}”.</li>}
            {matches.map((f) => (
              <li key={f.path.join(".")}>
                <button type="button" onClick={() => jump(f)} className="w-full px-3 py-2 text-left text-sm hover:bg-accent-soft">
                  {f.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex max-w-3xl flex-col gap-4">
        {card(
          "goal",
          <p>{s.goal}</p>,
          <Field path={["goal"]}>{text(s.goal, (v) => change((d) => void (d.goal = v)), 3)}</Field>,
        )}
        {card(
          "scenarios",
          <>
            <p className="font-medium">{scenario.title}</p>
            <p>{scenario.situation}</p>
          </>,
          <>
            <Field path={["scenarios", "title"]}>{text(scenario.title, (v) => change((d) => void (d.scenarios[0].title = v)))}</Field>
            <Field path={["scenarios", "situation"]}>
              {text(scenario.situation, (v) => change((d) => void (d.scenarios[0].situation = v)), 6)}
            </Field>
          </>,
          <Field path={["scenarios", "opening"]}>{text(scenario.opening, (v) => change((d) => void (d.scenarios[0].opening = v)), 3)}</Field>,
        )}
        {card(
          "positions",
          <Items items={s.positions} none="None: students don't pick a side." />,
          <ItemsEditor path={["positions"]} items={s.positions} max={6} onChange={(v) => change((d) => void (d.positions = v))} />,
        )}
        {card(
          "touchpoints",
          <Items items={s.touchpoints} none="None tracked." />,
          <ItemsEditor path={["touchpoints"]} items={s.touchpoints} max={12} onChange={(v) => change((d) => void (d.touchpoints = v))} />,
        )}
        {card(
          "persona",
          <p>
            <span className="font-medium">{s.persona.name}</span>, {s.persona.title} · {HELPFULNESS[s.persona.helpfulness]}
          </p>,
          <>
            <Field path={["persona", "name"]}>{text(s.persona.name, (v) => change((d) => void (d.persona.name = v)))}</Field>
            <Field path={["persona", "title"]}>{text(s.persona.title, (v) => change((d) => void (d.persona.title = v)))}</Field>
            <Field path={["persona", "helpfulness"]}>
              {(id) => (
                <select
                  id={id}
                  value={s.persona.helpfulness}
                  onChange={(e) => change((d) => void (d.persona.helpfulness = e.target.value as S["persona"]["helpfulness"]))}
                  className={`${inputStyles} max-w-60`}
                >
                  {Object.entries(HELPFULNESS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </>,
          <>
            <Field path={["persona", "background"]}>{text(s.persona.background, (v) => change((d) => void (d.persona.background = v)), 4)}</Field>
            <Field path={["persona", "tone"]}>{text(s.persona.tone, (v) => change((d) => void (d.persona.tone = v)))}</Field>
          </>,
        )}
        {card(
          "completion",
          <ul className="list-disc pl-5">
            {endings(s.completion).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>,
          <>
            <Field path={["completion", "maxTurns"]}>{limit(s.completion.maxTurns, (v) => change((d) => void (d.completion.maxTurns = v)))}</Field>
            <Field path={["completion", "timeLimitMinutes"]}>
              {limit(s.completion.timeLimitMinutes, (v) => change((d) => void (d.completion.timeLimitMinutes = v)))}
            </Field>
            <Field path={["completion", "question"]}>
              {text(s.completion.question ?? "", (v) => change((d) => void (d.completion.question = v.trim() === "" ? null : v)), 2)}
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                id={fieldId(["completion", "studentCanFinish"])}
                type="checkbox"
                checked={s.completion.studentCanFinish}
                onChange={(e) => change((d) => void (d.completion.studentCanFinish = e.target.checked))}
              />
              {settingTitle(["completion", "studentCanFinish"])}
            </label>
          </>,
        )}
        {card(
          "rubric",
          <ul className="flex flex-col gap-1">
            {s.rubric.criteria.map((c, i) => (
              <li key={i}>
                <span className="font-medium">
                  {c.label} ({c.points})
                </span>
                : {c.description}
              </li>
            ))}
          </ul>,
          <div id={fieldId(["rubric", "criteria"])} tabIndex={-1} className="flex flex-col gap-3">
            {s.rubric.criteria.map((c, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-control border border-border p-3">
                <Field path={["rubric", "criteria", String(i), "label"]} label={settingTitle(["rubric", "criteria", "label"])}>
                  {text(c.label, (v) => change((d) => void (d.rubric.criteria[i].label = v)))}
                </Field>
                <Field path={["rubric", "criteria", String(i), "description"]} label={settingTitle(["rubric", "criteria", "description"])}>
                  {text(c.description, (v) => change((d) => void (d.rubric.criteria[i].description = v)), 2)}
                </Field>
                <Field path={["rubric", "criteria", String(i), "points"]} label={settingTitle(["rubric", "criteria", "points"])}>
                  {(id) => (
                    <input
                      id={id}
                      type="number"
                      min={0}
                      step="any"
                      value={c.points}
                      onChange={(e) => change((d) => void (d.rubric.criteria[i].points = Number(e.target.value)))}
                      className={`${inputStyles} max-w-32`}
                    />
                  )}
                </Field>
                {s.rubric.criteria.length > 1 && (
                  <button
                    type="button"
                    onClick={() => change((d) => void d.rubric.criteria.splice(i, 1))}
                    className="self-start text-sm text-danger underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {s.rubric.criteria.length < 10 && (
              <button
                type="button"
                onClick={() => change((d) => void d.rubric.criteria.push({ label: "", description: "", points: 1 }))}
                className="self-start text-sm font-medium text-accent-text underline"
              >
                Add a criterion
              </button>
            )}
          </div>,
          <Field path={["rubric", "strictness"]}>
            {(id) => (
              <select
                id={id}
                value={s.rubric.strictness}
                onChange={(e) => change((d) => void (d.rubric.strictness = e.target.value as S["rubric"]["strictness"]))}
                className={`${inputStyles} max-w-60`}
              >
                {STRICTNESS.map((value) => (
                  <option key={value} value={value}>
                    {STRICTNESS_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </Field>,
        )}
      </div>

      {(state.error || state.problems) && (
        <div role="alert" className="flex flex-col gap-1 text-sm text-danger">
          {state.error && <p>{state.error}</p>}
          {state.problems && (
            <ul className="list-disc pl-5">
              {state.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {published ? (
          <Button name="intent" value="save" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        ) : (
          <>
            <Button name="intent" value="publish" disabled={pending}>
              {pending ? "Saving…" : "Publish"}
            </Button>
            <Button variant="secondary" name="intent" value="save" disabled={pending}>
              Save draft
            </Button>
          </>
        )}
        <span className="text-sm text-muted" role="status">
          {json === savedJson ? (state.savedAt ? "Saved." : "") : "You have changes that aren't saved yet."}
        </span>
      </div>
    </form>
  );
}
