"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Sparkle } from "@phosphor-icons/react";
import { Button, inputStyles } from "@/components/ui";
import { assistAction, saveSettingsAction, type FormState } from "./actions";
import { AssistButton } from "./assist-button";
import { cardOf, type CardKey, FIELDS, fieldId, shownCards } from "./fields";
import { PickerField } from "./forms";
import { MODES } from "./modes";
import { applyParts, isEmpty, partTitle, PARTS, STEP_PARTS, type PartKey } from "./parts";
import { rubricPoints, settingHelp, settingTitle, STRICTNESS, type StudyChatSettings } from "./schema";
import { OptionTable } from "./wizard/option-table";
import { MINUTES } from "./wizard/query";
import { SETUP_COMING_SOON, STUDENT_SWITCHES_STEP } from "./wizard/setup-cards";
import { WIZARD_FORM_ID } from "./wizard/steps";

type S = StudyChatSettings;
type Item = { label: string; description: string };

const HELPFULNESS = { challenging: "Challenging", balanced: "Balanced", supportive: "Supportive" } as const;
const STRICTNESS_LABELS = { strict: "Strict", balanced: "Balanced", lenient: "Lenient" } as const;

type EditorState = FormState & { snapshot?: string };

function endings(c: S["completion"]): string[] {
  return [
    c.maxTurns !== null && `After ${c.maxTurns} student ${c.maxTurns === 1 ? "message" : "messages"}`,
    c.minTurns !== null && `Not before ${c.minTurns} student ${c.minTurns === 1 ? "message" : "messages"} (except by the message or time limit)`,
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

function Field({ path, label, action, children }: { path: string[]; label?: string; action?: ReactNode; children: (id: string) => ReactNode }) {
  const id = fieldId(path);
  const help = settingHelp(path);
  return (
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label ?? settingTitle(path)}
        </label>
        {action}
      </span>
      {help && (
        <p id={`${id}-help`} className="-mt-0.5 text-[13px] text-muted">
          {help}
        </p>
      )}
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

/** A list's DALAA button, at the top right of its card. */
function ListAssist({ children }: { children: ReactNode }) {
  return <div className="flex justify-end">{children}</div>;
}

/**
 * In the wizard: which step this is (the server works out where Next goes)
 * and the step Back goes to. Back, like Next and the step list, saves first.
 * The step's cards start open, with no search box and no Publish.
 */
export type WizardEditing = { step: string; previous: string | null };

/**
 * The review screen's body: one short summary card per part of the chat, each
 * opening to edit it, a search box that jumps to any setting, then Save draft
 * and Publish. Everything is checked against the schema on the server.
 * `cards` limits it to some cards (a wizard step's); the save action is the same.
 */
export function StudyChatEditor({
  courseId,
  activityId,
  published,
  initial,
  addToCanvas,
  cards,
  wizard,
}: {
  courseId: string;
  activityId: string;
  published: boolean;
  initial: S;
  addToCanvas: string | null;
  cards?: readonly CardKey[];
  wizard?: WizardEditing;
}) {
  const shown = shownCards(cards);
  const [s, setS] = useState(initial);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set(wizard ? shown : []));
  const [query, setQuery] = useState("");
  const [state, action, pending] = useActionState<EditorState, FormData>(
    async (prev, form) => ({
      ...(await saveSettingsAction(prev, form)),
      snapshot: String(form.get("settings")),
    }),
    {},
  );

  // A refused save (from Next, Back or the step list) brings its reasons into view.
  const refused = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error || state.problems) refused.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state]);

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

  // DALAA writes one thing at a time: a box, a list, or the step's empty boxes ("page").
  const [writing, setWriting] = useState<PartKey | "page" | null>(null);
  const [assistError, setAssistError] = useState<{ at: PartKey | "page"; reason: string } | null>(null);
  const runAssist = async (at: PartKey | "page", parts: PartKey[], instruction: string) => {
    setWriting(at);
    setAssistError(null);
    const result = await assistAction(activityId, JSON.stringify(s), parts, instruction).catch(() => ({
      ok: false as const,
      reason: "DALAA couldn't write that this time. Try again, or write it yourself.",
    }));
    setWriting(null);
    if (result.ok) change((d) => applyParts(d, result.values));
    else setAssistError({ at, reason: result.reason });
  };
  const assist = (key: PartKey) => (
    <AssistButton
      name={partTitle(key)}
      empty={isEmpty(s, key)}
      busy={writing === key || (writing === "page" && pageParts.includes(key))}
      disabled={writing !== null}
      error={assistError?.at === key ? assistError.reason : null}
      onRun={(instruction) => runAssist(key, [key], instruction)}
    />
  );
  // On a wizard step: the boxes "Draft this page" fills, those still empty (feedback aab2aed5).
  const stepParts = (wizard ? (STEP_PARTS[wizard.step] ?? []) : []).filter((k) => shown.includes(PARTS[k].path[0] as CardKey));
  const pageParts = stepParts.filter((k) => isEmpty(s, k));
  const [direction, setDirection] = useState("");

  const q = query.trim().toLowerCase();
  const matches = q
    ? FIELDS.map((f) => ({ ...f, label: `${settingTitle([cardOf(f)])} › ${settingTitle(f.path)}` })).filter((f) => f.label.toLowerCase().includes(q))
    : [];
  const jump = (f: (typeof FIELDS)[number]) => {
    flushSync(() => setOpen((prev) => new Set([...prev, cardOf(f), ...(f.more ? [`${cardOf(f)}:more`] : [])])));
    const el = document.getElementById(fieldId(f.path));
    el?.scrollIntoView({ block: "center" });
    el?.focus();
    setQuery("");
  };

  const card = (key: CardKey, summary: ReactNode, body: ReactNode, more?: ReactNode) =>
    shown.includes(key) && (
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
          {settingHelp([key]) && <span className="-mt-1 text-[13px] text-muted">{settingHelp([key])}</span>}
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

  // The two student switches: in their cards on the review screen, on their own step in the wizard.
  const switches = {
    studentWork: {
      id: fieldId(["studentWork"]),
      label: settingTitle(["studentWork"]),
      help: MODES[s.mode].needsStudentWork
        ? `${settingHelp(["studentWork"])} A ${MODES[s.mode].label} chat always needs it.`
        : settingHelp(["studentWork"]),
      input: (
        <input
          id={fieldId(["studentWork"])}
          type="checkbox"
          checked={s.studentWork}
          disabled={MODES[s.mode].needsStudentWork}
          onChange={(e) => change((d) => void (d.studentWork = e.target.checked))}
        />
      ),
    },
    showProgress: {
      id: fieldId(["showProgress"]),
      label: settingTitle(["showProgress"]),
      help: settingHelp(["showProgress"]),
      input: (
        <input
          id={fieldId(["showProgress"])}
          type="checkbox"
          checked={s.showProgress}
          onChange={(e) => change((d) => void (d.showProgress = e.target.checked))}
        />
      ),
    },
  };
  const inCard = (sw: (typeof switches)[keyof typeof switches]) =>
    !wizard && (
      <label className="flex items-center gap-2 text-sm font-medium">
        {sw.input}
        {sw.label}
      </label>
    );
  const comingSoon = wizard ? (SETUP_COMING_SOON[wizard.step as keyof typeof SETUP_COMING_SOON] ?? []) : [];

  const scenario = s.scenarios[0];
  return (
    <form
      id={wizard ? WIZARD_FORM_ID : undefined}
      action={action}
      // Enter in a one-line field must not publish.
      onKeyDown={(e) => e.key === "Enter" && e.target instanceof HTMLInputElement && e.preventDefault()}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="settings" value={json} />
      {wizard && <input type="hidden" name="wizardStep" value={wizard.step} />}
      <PickerField addToCanvas={addToCanvas} />

      {!wizard && (
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
      )}

      <div className="flex max-w-3xl flex-col gap-4">
        {pageParts.length > 0 && (
          <section aria-label="Draft with DALAA" className="flex flex-col gap-2 rounded-panel border border-accent bg-accent-soft p-4">
            <p className="text-sm">
              {pageParts.length === stepParts.length
                ? "Write this page yourself, or let DALAA draft it from your materials and goal. Then use Tweak on any box."
                : "DALAA can fill in the empty boxes, keeping to what you've written."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Anything DALAA should know? (optional)"
                value={direction}
                maxLength={500}
                placeholder="Anything DALAA should know? (optional) e.g. set it in a hospital"
                onChange={(e) => setDirection(e.target.value)}
                className={`${inputStyles} min-w-0 flex-1 basis-64 text-sm`}
                autoComplete="off"
              />
              <Button type="button" disabled={writing !== null} onClick={() => runAssist("page", pageParts, direction)}>
                <Sparkle size={16} weight="fill" aria-hidden />
                {writing === "page" ? "Drafting…" : pageParts.length === stepParts.length ? "Draft this page with DALAA" : "Fill in the empty boxes"}
              </Button>
            </div>
            {assistError?.at === "page" && (
              <p role="alert" className="text-sm text-danger">
                {assistError.reason}
              </p>
            )}
          </section>
        )}
        {card(
          "goal",
          <p>{s.goal}</p>,
          <Field path={["goal"]} action={assist("goal")}>{text(s.goal, (v) => change((d) => void (d.goal = v)), 3)}</Field>,
        )}
        {card(
          "scenarios",
          <>
            {scenario.title || scenario.situation || scenario.opening ? (
              <>
                <p className="font-medium">{scenario.title}</p>
                <p>{scenario.situation}</p>
                {scenario.opening && (
                  <p>
                    <span className="text-muted">Opens with:</span> &ldquo;{scenario.opening}&rdquo;
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted">Not written yet.</p>
            )}
            {s.studentWork && <p className="text-muted">Each student adds their own work before the chat.</p>}
          </>,
          <>
            <Field path={["scenarios", "title"]} action={assist("title")}>{text(scenario.title, (v) => change((d) => void (d.scenarios[0].title = v)))}</Field>
            <Field path={["scenarios", "situation"]} action={assist("situation")}>
              {text(scenario.situation, (v) => change((d) => void (d.scenarios[0].situation = v)), 6)}
            </Field>
            {/* The first thing a student sees, so never under "More options" (feedback 2038e05e). */}
            <Field path={["scenarios", "opening"]} action={assist("opening")}>{text(scenario.opening, (v) => change((d) => void (d.scenarios[0].opening = v)), 3)}</Field>
            {inCard(switches.studentWork)}
          </>,
        )}
        {card(
          "positions",
          <Items items={s.positions} none="None: students don't pick a side." />,
          <>
            <ListAssist>{assist("positions")}</ListAssist>
            <ItemsEditor path={["positions"]} items={s.positions} max={6} onChange={(v) => change((d) => void (d.positions = v))} />
          </>,
        )}
        {card(
          "touchpoints",
          <>
            <Items items={s.touchpoints} none="None tracked." />
            {s.showProgress && <p className="text-muted">Students see their progress as they chat.</p>}
          </>,
          <>
            <ListAssist>{assist("touchpoints")}</ListAssist>
            <ItemsEditor path={["touchpoints"]} items={s.touchpoints} max={12} onChange={(v) => change((d) => void (d.touchpoints = v))} />
            {inCard(switches.showProgress)}
          </>,
        )}
        {card(
          "persona",
          s.persona.name ? (
            <p>
              <span className="font-medium">{s.persona.name}</span>
              {s.persona.title && `, ${s.persona.title}`} · {HELPFULNESS[s.persona.helpfulness]}
            </p>
          ) : (
            <p className="text-muted">Not written yet.</p>
          ),
          <>
            <Field path={["persona", "name"]} action={assist("personaName")}>{text(s.persona.name, (v) => change((d) => void (d.persona.name = v)))}</Field>
            <Field path={["persona", "title"]} action={assist("personaRole")}>{text(s.persona.title, (v) => change((d) => void (d.persona.title = v)))}</Field>
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
            <Field path={["persona", "background"]} action={assist("background")}>{text(s.persona.background, (v) => change((d) => void (d.persona.background = v)), 4)}</Field>
            <Field path={["persona", "tone"]} action={assist("tone")}>{text(s.persona.tone, (v) => change((d) => void (d.persona.tone = v)))}</Field>
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
            {/* The length lives with the limits it sets (feedback 3a3b2402); nothing stores the choice itself. */}
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">About how long?</span>
              <span className="-mt-0.5 text-[13px] text-muted">Pick a length to set “{settingTitle(["completion", "maxTurns"])}” to fit. Add a time limit below for a hard stop.</span>
              <span className="flex flex-wrap gap-2">
                {MINUTES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => change((d) => void (d.completion.maxTurns = m.turns))}
                    className="rounded-full border border-border-strong bg-surface px-3 py-0.5 text-sm text-accent-text hover:bg-subtle"
                  >
                    {m.label}
                  </button>
                ))}
              </span>
            </div>
            <Field path={["completion", "maxTurns"]}>{limit(s.completion.maxTurns, (v) => change((d) => void (d.completion.maxTurns = v)))}</Field>
            <Field path={["completion", "minTurns"]}>{limit(s.completion.minTurns, (v) => change((d) => void (d.completion.minTurns = v)))}</Field>
            <Field path={["completion", "timeLimitMinutes"]}>
              {limit(s.completion.timeLimitMinutes, (v) => change((d) => void (d.completion.timeLimitMinutes = v)))}
            </Field>
            <Field path={["completion", "question"]} action={assist("question")}>
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
            <ListAssist>{assist("criteria")}</ListAssist>
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
        {wizard?.step === STUDENT_SWITCHES_STEP && (
          <OptionTable
            title="What students see and do"
            rows={[switches.studentWork, switches.showProgress].map((sw) => ({
              label: (
                <>
                  <label htmlFor={sw.id}>{sw.label}</label>
                  {sw.help && <span className="mt-0.5 block text-[13px] font-normal text-muted">{sw.help}</span>}
                </>
              ),
              control: sw.input,
            }))}
            comingSoon={comingSoon}
          />
        )}
        {wizard?.step === "grading" && (
          <>
            <p className="text-sm">
              <span className="font-medium">Total: {rubricPoints(s)} points.</span>{" "}
              <span className="text-muted">The activity is worth the total, and Canvas gets the same.</span>
            </p>
            <OptionTable title="More grading options" comingSoon={comingSoon} />
          </>
        )}
      </div>

      {(state.error || state.problems) && (
        <div ref={refused} role="alert" className="flex flex-col gap-1 text-sm text-danger">
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
        {wizard ? (
          <>
            {wizard.previous && (
              <button type="submit" name="intent" value={`goto:${wizard.previous}`} disabled={pending} className="text-sm text-muted hover:text-text">
                ← Back
              </button>
            )}
            <span className="flex-1" />
          </>
        ) : published ? (
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
        {/* After the draft, a teacher who trusts it can go straight to Review (Nathan, 2026-11-13). */}
        {wizard?.step === "scenario" && (
          <button type="submit" name="intent" value="goto:review" disabled={pending} className="text-sm text-accent-text underline hover:text-text">
            Skip to review
          </button>
        )}
        {wizard && (
          <Button name="intent" value="next" disabled={pending}>
            {pending ? "Saving…" : "Next"}
          </Button>
        )}
      </div>
    </form>
  );
}
