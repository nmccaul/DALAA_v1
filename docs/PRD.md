# DALAA v1 — Product Requirements

*Draft 2026-09-30. Owner: Nathan McCauley. Stakeholders: Scott Sampson (faculty
lead), Lucy Levie. Sources: 2026-09-28 team meeting, DAALAA v1 PRD and plans,
Quizzer, MakeTheCase, Scholarly — see `CONTEXT.md`.*

---

## 1. Problem

Students use AI constantly and mostly without structure. Assignments that grade
a final product no longer show what a student understands. Instructors need
activities where the AI plays a structured role (case protagonist, novice to be
taught, quizmaster) and where the *process* of the conversation becomes evidence
of learning.

Scott has proven the value in class: Quizzer ran quizzes across three semesters;
Make the Case ran case chats, and its new class analytics ("52% of you took this
position" → click for anonymous quotes → optionally reveal names) changed how
he teaches a case discussion.

The tools that proved this are hard for anyone else to adopt: separate apps,
separate stacks, separate setup, no shared Canvas flow.

## 2. Vision — an Office suite, not an everything-app

DALAA is a **suite**: separate, excellent activity tools with a common look and
feel and shared plumbing.

- **Office, not Symphony.** Symphony tried to be spreadsheet, word processor, and
  database in one and was mediocre at all three. Office shipped separate products
  under shared standards (same menus, same file conventions) governed centrally.
- **Greatest hits.** We don't know which tool departments will love. Build
  several; promote what works to the "A side" (main menu); let others experiment
  on the "B side".
- **Marriott.** Other people's tools (e.g. Adam Jensen's team-homework quiz for
  Professor Webb) can join the suite if they meet the standard. We provide the
  chassis; they bring the activity.

## 3. Users

| User | Needs |
|---|---|
| **Instructor (primary)** | Get from zero to a graded activity fast, with content they already have. Never learn our data model. |
| **Student** | Open the activity from Canvas, sign in once with BYU, do it, see feedback. A failure never costs them work. |
| **Tool builder** (Scott, Adam, future students) | A clear contract: what the chassis provides, what a tool must supply. |

## 4. Goals for v1 (Winter 2027 pilot)

1. **Simple teacher setup** — first sign-in to live, grade-posting activity in
   **< 60 minutes**, validated by stopwatch with a colleague who has never seen it.
2. **Navigable UI** — three top-level areas (Courses · Library · Settings);
   first-run path touches only Courses.
3. **Shared chassis** — BYU sign-in, Canvas (REST API), courses/sections/roster,
   scheduling, grade push + reconciliation, one results store, one UI shell.
4. **Two or three tools on the chassis**, starting with the most proven
   (see §8 for proposed order).
5. **Class-level insight** for every tool, built on the shared results shape.

### Non-goals for v1

*v2 and v3 scope is in `ROADMAP.md`.*

- LTI 1.3 (kept possible, not built — see `DECISIONS.md` D-004).
- Institutions other than BYU; LMSs other than Canvas.
- Converting an activity from one tool to another (should-have, later).
- Automatic grade posting or automatic roster deletion — ever.
- Charging for setup (see `DECISIONS.md` D-006).

## 5. Teacher flow

Target: **every step is one obvious action; confirmations appear only when
there's an exception.**

### First time (≈10 min of the 60)

1. **Sign in with BYU.** First sign-in *is* account creation. No username,
   password, or email confirmation.
2. **Courses (empty).** One large card: *Bring in a course from Canvas.*
3. **Connect Canvas** — the riskiest screen; make it hand-held:
   - A button that opens Canvas's token page in a new tab
     (`byu.instructure.com/profile/settings`), with a 3-step picture guide
     ("New Access Token" → name it "DALAA" → copy).
   - A single paste box. Verify immediately against Canvas; on success show the
     teacher's Canvas name so they know it worked.
   - Explain plainly what the token lets DALAA do and that it can be revoked in
     Canvas at any time.
   - Only shown once; afterwards it lives quietly under Settings.
4. **Pick a course** from the list Canvas returns (never type an id). Importing
   creates the course, its sections, and its roster **in one step**. Show the
   roster review only if something needs a human (unmatched student, section
   ambiguity); otherwise just "42 students added."

### Each activity

5. **Inside the course → New activity →** pick a tool (flat catalogue, a few
   large cards; never sorted by effort).
6. **Give it source material** (upload/paste the reading, case, or existing quiz)
   → DALAA generates a **good draft** → teacher edits in place, step by step (the
   Case Writer's coaching style is the model to copy).
7. **Preview as a student** — same code path students use.
8. **Schedule:** dates default from the Canvas course; per-section windows only
   if they ask. Toggle **"Add to Canvas gradebook"** (creates a published
   Canvas assignment with a link to the activity).
9. **Students** click the link in Canvas → sign in with BYU → do the activity.
10. **Results:** class view (themes, positions, criteria met) + per-student drill-down.
11. **Post grades** — one button, a summary line (*n ready · m unchanged ·
    k need attention*), confirm only the exceptions.

### Ongoing

- Roster: re-sync with one click from the course page (adds and flags, never
  deletes). Consider a quiet check-on-open that only interrupts if something changed.
- Token expired/revoked: a friendly "Reconnect Canvas" screen, never a generic error.
- Next term: re-use activities from **Library** into the new course.

## 6. Student flow

Canvas assignment link → DALAA → **Sign in with BYU** (once per session) →
activity → feedback. Not embedded in Canvas (that would need LTI). A failed AI
turn never loses their work; "Save and finish later" always means the same thing.

## 7. Architecture

- **Chassis** (shared): auth (BYU Okta OIDC, NetID identity), Canvas client,
  courses/sections/roster, scheduling, grade push + reconciliation audit ledger,
  results store, LLM gateway + cost ledger, UI shell and design tokens.
- **Tools** (separate): each in its own directory with its own activity JSON
  schema, authoring wizard, student experience, and prompts. Each registers with
  the chassis; the chassis never branches on tool name.
- **Shared results shape**: per attempt × criterion → status, weight, evidence.
  This is what powers class analytics across tools.
- **Stack (proposed, confirm — D-007):** TypeScript, Next.js, plain Postgres,
  Vercel — the DAALAA choice; vendor-neutral Postgres so the DB can move to BYU
  infrastructure by changing a connection string.

Canvas specifics: `CANVAS.md`.

## 8. Tools — proposed order

| Order | Tool | Why | Status in old repos |
|---|---|---|---|
| 1 | **Case Chat** (Make the Case) | Most proven and most active; class analytics is the "revolutionary" feature | MakeTheCase — mature, active through 2026-09-21 |
| 2 | **Quiz** (Quizzer) | Proven 3 semesters; runs without AI, good first chassis test | Quizzer `main` |
| 3 | **Explain** | Likely belongs *with* Case Chat (explain the reading to the protagonist) rather than inside Quizzer | Quizzer `daila-v1` branch, unmerged |
| — | Revise | Declared in DAALAA; lower priority | Quizzer `daila-v1` |
| — | External tools (Adam Jensen) | Join via the tool-builder contract | Not started |

*Open: DAALAA's plan builds QUIZ first because it runs with every AI provider
down. Decide whether Case Chat or Quiz goes first (D-008).*

## 9. Tool-builder contract (draft — "how the DALAA model works")

The chassis gives you: sign-in, courses and rosters from Canvas, scheduling and
deadlines, Canvas assignment creation and grade posting, the UI shell, LLM
access with cost tracking, and class reporting.

You provide: an activity JSON schema, an authoring flow that starts from a draft,
the student experience inside the shell, prompts, and results written in the
shared shape.

You may not: call Canvas directly, add your own sign-in, or change the shared
navigation without approval.

## 10. Success measures

- Stopwatch test: cold colleague, < 60 min, only the Courses area.
- Zero lost student work from AI/provider failures.
- Zero grades overwritten that an instructor changed in Canvas.
- Instructors reuse an activity in a second course/term.
- Interest signal from the Friday AI seminar poll and faculty tech committee.

## 11. Open questions

See `DECISIONS.md` → *Open*. Blocking external ones: BYU IT approval of personal
Canvas tokens at multi-instructor scale; FERPA / where student records may live
(Vercel?); Okta client registration and redirect URIs; Classic vs New Quizzes.
