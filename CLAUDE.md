# DALAA v1 — working conventions

**Read this before writing code.** Product direction lives in `docs/PRD.md`;
why things are the way they are lives in `docs/DECISIONS.md`; what already
exists in the older repos lives in `docs/CONTEXT.md`. Business strategy and
marketing live in `docs/strategy/`.

> If a rule here blocks you, stop and ask. Do not route around it. Most of these
> were paid for with a real defect in Quizzer, MakeTheCase, or DAALAA.

---

## What this is

DALAA is a **suite of AI-assisted learning activities** that sits beside Canvas
(the umbrella the team has called DALLA/DAALAA — *Dynamic AI-Assisted Learning
Activities & Assessments*). Canvas keeps the roster and the gradebook; DALAA is
where the learning happens.

**The model is Microsoft Office, not Lotus Symphony.** Each activity tool
(Quizzer, Case Chat / Make the Case, Explain, …) is its own experience with its
own workflow. They share one chassis — sign-in, Canvas, courses, scheduling,
grade posting, reporting — and one look and feel. We are not building one app
that does everything at a mediocre level.

**v1 audience:** a handful of BYU instructors, pilot Winter 2027. Versions are
v1 → v2 → v3 (`docs/ROADMAP.md`); build v1 scope only unless told otherwise.

---

## The two product rules that beat everything else

1. **Teacher setup must be as simple as possible.** Measure it: a colleague who
   has never seen DALAA gets from first sign-in to a live activity posting grades
   to Canvas in **under 60 minutes**, using content they already have.
2. **The UI must be obvious to navigate.** Three top-level areas at most
   (**Courses · Library · Settings**). The first-run path uses only **Courses**.
   If a screen needs the teacher to understand our object model first, the screen
   is wrong.

When a technical choice trades against either rule, the rule wins unless a
human says otherwise.

---

## UI and flow rules

- **The course is the home object.** After sign-in a teacher picks a course and
  works inside it.
- **Just-in-time setup, never prerequisite.** Ask for the Canvas token the moment
  it is first needed, not on a settings page up front. Importing a Canvas course
  creates its sections and roster in the same step.
- **One primary action per screen**, visually obvious. Secondary paths are small.
- **A blank field is never a screen's primary state.** Authoring screens open with
  a draft generated from the teacher's source material. A *bad* draft is worse
  than none — it burns patience and gets rewritten anyway.
- **Every tool uses the shared shell:** same navigation, same menus, same
  placement of Save / Preview / Schedule / Post grades. Tools may differ in
  accent color and in the activity screen itself — nothing else.
- **Only ask when there is something to decide.** Show a preview/confirm step
  only when there is an exception (unmatched student, points mismatch, lowered
  grade). The clean case should be one click.
- **Display stored values exactly as stored.** Never derive a toggle's state from
  related data existing (MakeTheCase shipped this bug).
- **Meters name what they count** — "Findings uncovered — 1 of 4", never a bare
  "0 of 3".
- **"Save and finish later" means one thing everywhere.**
- **Plain language.** No "offering", "variant", "schema", or "scope" on any
  teacher- or student-facing screen.

---

## Architecture rules

- **Chassis vs tools.** Shared code (auth, Canvas, courses, scheduling, grade
  push, results, UI shell) lives in the chassis. Each tool lives in its own
  directory and must not reach into another tool.
- **Every activity is defined in JSON with its own schema per tool.** Quizzes,
  Explain activities, and Case Chats are *not* forced into one shape (forcing
  Explain into the quiz schema was the mistake that started this rewrite).
  Converting between tools is a later "should-have", done by explicit mapping.
- **Results share one shape across tools.** Whatever a tool's activity looks like,
  what it *writes for assessment* (per student, per criterion, with evidence) is
  the same shape everywhere, so class-level reporting — the "52% of you took this
  position" view from Case Chat — works for every tool. *The interaction may vary
  freely; the assessed output may not.*
- **The core never branches on a tool name.** Tools register behavior; the chassis
  doesn't ask who they are.
- **Hidden material is never sent to the student's browser.** Teaching notes and
  answer keys are not fetched for student requests — not fetched and filtered,
  not fetched at all.

---

## Canvas (REST API, not LTI — see `docs/DECISIONS.md`)

Detailed design: `docs/CANVAS.md`. Non-negotiables:

- **All Canvas HTTP goes through one client module.** No page calls Canvas
  directly. This also keeps the door open to LTI later.
- **Each teacher uses their own token.** No lending, no fallback, no shared admin
  token. Encrypt at rest; the key never lives with the ciphertext; the UI shows
  only the last 4 characters. Never log headers, tokens, or request bodies.
- **Identity is the BYU NetID** (`users.external_id`), not the SSO provider's
  opaque `sub`. Roster sync creates students before they ever sign in; keying on
  anything else gives every student a second, empty account.
- **Roster sync adds and flags; it never deletes.**
- **Grades post on an explicit push, never automatically.** An unconfirmed push
  is never recorded as sent. A grade edited in Canvas is a category to report,
  never something to overwrite. A points disagreement refuses; it never rescales.
- **NULL is not zero.** Unscored, in progress, and never attempted are different.
- Canvas quirks already paid for: throttling can arrive as **403**; follow
  `Link: rel="next"` for pagination and raise rather than truncate;
  `update_grades` is **POST** not PUT and is asynchronous (poll Progress);
  sending `''` for a date *clears* it; `completed` comes back for `concluded`.
- **No course is ever live in both Quizzer and DALAA.**

---

## Data rules that shipped as bugs before

- ⚠ **A NULL in a UNIQUE key constrains nothing.** Use NOT NULL columns or a
  generated `COALESCE` column.
- **Every request that writes is idempotent** (carries a client-generated id).
  A retry must not create a second turn or charge twice.
- **A failed AI turn costs the student nothing.**
- **Every ownership filter goes through one scope builder**, and a scope that
  matches nothing returns an explicit "match nothing", never an empty string.
  (DAALAA's `or()` helper rewrote `and` inside fragments into `or` — do not port
  it; test composition with fragments that contain `and`.)
- **LLM cost is NULL when unknown, never 0.** One ledger row per real API call.
- **Never edit an applied migration.** Add a new one.

---

## Working style

- Match surrounding code: naming, comment density, idiom.
- One place per concept. If a change needs the same fact edited in two files,
  fix the duplication.
- Any new invariant is a constraint or a test, not a comment.
- Record product decisions in `docs/DECISIONS.md` (dated, with who decided);
  update `docs/PRD.md` when direction changes. Don't leave decisions only in chat.
- Small PRs (aim < 400 changed lines). Don't merge your own PR.
