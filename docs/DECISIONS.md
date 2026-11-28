# Decisions

*Append new decisions; don't rewrite old ones — supersede them with a new entry.*

---

## Made

### D-001 · DALAA is a suite (Office), not an everything-app (Symphony)
*2026-09-28 meeting — Scott, Nathan, Lucy.*
Separate tools with their own workflows, one common look and feel and shared
plumbing. Adopt a "greatest hits" approach: build several, promote what works.

### D-002 · Shared infrastructure lives in one chassis
*2026-09-28 meeting; refined 2026-09-30.*
Canvas, sign-in, rosters, scheduling, and grade posting are written once and used
by every tool. The meeting said "microservices"; we implement it as **one shared
codebase/module layer**, not separately deployed network services — too heavy for
this team size.

### D-003 · Every activity is JSON; each tool has its own schema — results share one shape
*2026-09-28 meeting (JSON + separate schemas); 2026-09-30 (shared results).*
Forcing Explain into the quiz schema failed. Activity *definitions* differ per
tool. Assessment *output* has one shape so class analytics work across tools.

### D-004 · Canvas via REST API with each teacher's own token, not LTI 1.3
*Proposed in DAALAA `dev/2026-09-22-canvas-api-and-sso-plan.md`; adopted
2026-09-30 by Nathan.*
Works at BYU without a Canvas admin installing anything; design already proven
on Quizzer's `daila-v1` branch. Costs: students leave Canvas and sign in again;
each teacher manages a token; not portable to other institutions without work.
**Keep LTI possible:** all Canvas code in one module, NetID identity, grade rules
separate from the code that sends grades.

### D-005 · Teacher setup simplicity and navigability are the top product priorities
*2026-09-30, Nathan.* See `CLAUDE.md` "two product rules".

### D-006 · Don't charge for setup
*2026-09-30.* With the token flow, setup is ~2 minutes; there's nothing to charge
for, and handling teachers' tokens on their behalf is a security liability.
Revenue, if any, comes from pedagogy (activity/case design, training, seminars)
or institutional licensing.

### D-007 · Stack: TypeScript + Next.js + Supabase Postgres + Vercel — built portable
*2026-10-03, Nathan.* Supersedes the open D-007 question.
Supabase is used **as hosted Postgres** (plus file storage later), Vercel hosts
the app. Guardrails so production can still move to BYU infrastructure:
- **No Supabase Auth.** Identity is the NetID through our own sign-in seam.
- **Plain SQL migrations** run by our own runner; no Supabase-only SQL features.
  The browser never talks to the database; all queries run on the server.
- File storage sits behind one module.
- Next.js builds in `standalone` mode so it runs on any Node server
  (PM2 + Apache, like MakeTheCase on `services.byu.edu`).

### D-015 · Production hosting is decided with BYU IT before the pilot
*2026-10-03, Nathan.* Develop on Vercel + Supabase with fake data only. Before
any real student data goes in (before Winter 2027), choose: stay on Vercel +
Supabase with BYU's approval, or move production to a BYU server. Scott's
current apps (MakeTheCase, Quizzer) run on BYU's own server at
`services.byu.edu` (Apache + PM2/mod_wsgi + MySQL), so student data has never
left BYU before. Hosting on BYU servers ties DALAA to BYU (relevant to #6, IP).

**Update 2026-10-03:** the pre-pilot site runs on Nathan's personal Vercel
account (project `dalaa-v1`) with a free Supabase database (AWS us-east-1)
created through Vercel's Marketplace. Fake data only; test sign-in behind a
password. Revisit with BYU IT before real students.

### D-016 · Phase 1 is the foundation, without the Canvas API
*2026-10-03, Nathan.* Phase 1 = project skeleton, teacher setup, the teacher
home pages and the look and feel (UI shell + design system). No dependency on
BYU approvals: sign-in uses a **dev stand-in login** behind a sign-in provider
seam (Okta plugs in later, #14); courses are **set up by hand** (name, sections,
roster pasted or uploaded as CSV). Grade CSV export and a copyable activity
link cover Canvas until the API work (#17–#22).

### D-017 · Manual course setup stays as a fallback; manual rosters key on NetID
*2026-10-03, Nathan.* After Canvas import ships it is the primary path; "set it
up yourself" stays as a small secondary option (demos, teachers without token
approval). A manual roster **must** key students on NetID so connecting Canvas
later *links* the course instead of duplicating it — one account per student.

### D-018 · Multiple instructors: memberships, one scope builder, staff allowlist
*2026-10-03, Nathan.* A course has instructors and students through a
membership table (user × course × role); a professor may teach many courses
and a course may have several instructors. Every ownership filter goes through
the one scope builder. Staff accounts come only from an admin-managed allowlist
of NetIDs, never from sign-in alone. Core tables carry `institution_id` now
(one value, BYU) so v3 multi-institution doesn't need a painful migration.

### D-019 · Build the Canvas flow against a practice Canvas first
*2026-10-03, Nathan.* Canvas Free-for-Teacher is gone and Canvas Lite has no
API tokens, so DALAA serves its own practice Canvas (same API shape, fake data)
and the real client runs against it. Switching to BYU Canvas changes only the
base URL and token. In parallel: ask Scott for teacher access to his practice
course (24795) to smoke-test against real BYU Canvas, and ask BYU IT for a
developer key so "Connect Canvas" can be one click instead of a pasted token.

### D-009 · Converting activities between tools is a should-have, not v1 (it is v2)
*2026-09-28 meeting (Lucy raised; Nathan scoped).* Make a ticket; revisit after
the chassis ships.

### D-010 · Invite outside tool builders (Adam Jensen) once the contract exists
*2026-09-28 meeting.* Scott to invite. Needs the tool-builder contract (PRD §9)
written first.

### D-020 · LTI 1.3 now, for gitgrade; REST stays for BYU
*2026-10-29, Nathan.* Amends D-004 and moves LTI out of v3.
DALAA runs as an LTI 1.3 tool in Nathan's own Canvas
(`gitgrade.opencanvaslms.org`, he is admin) so the whole loop — launch, roster
(NRPS), deep linking, grades (AGS) — can be tested inside Canvas. The REST path
with each teacher's own token stays for BYU, where no admin will install a tool
yet. Both go through service modules (`src/canvas/`, `src/lti/`); no page
speaks HTTP to Canvas. The grade rules (explicit push, unconfirmed is never
sent, Canvas edits reported not overwritten, points mismatch refuses) apply to
AGS unchanged. LTI code is written fresh from the spec, not copied from
Scholarly. Instructors arriving by LTI are admitted as staff for that course
without the allowlist (Canvas has already said who teaches it).

### D-021 · Study Chat is the first tool, with modes
*2026-10-29, Nathan.* Answers D-008 for the gitgrade test build.
Study Chat: the student reads content, then chats about it; an AI grader scores
the transcript against a rubric. One settings schema (content, goal, scenario,
positions, touchpoints, persona, completion, rubric + grader strictness), every
field drafted by AI. **Modes** are presets that seed the draft, not separate
tools: Explain, Apply, LikenToMe, Case Chat, Debate, Pitch, Interview, Roleplay,
Liken2Us, Socratic. Quizzer and Oral Assessment show as "Coming soon".

### D-022 · Supabase Auth as one identity provider into `admit()`
*2026-10-29, Nathan.* Amends D-007's "No Supabase Auth".
Outside Canvas, people sign in with email + password through Supabase Auth.
Accounts are created server-side with the admin API, already confirmed, so no
email is sent; only `SCHOOL_EMAIL_DOMAINS` (`byu.edu`) may sign up. Supabase
only proves who someone is — `admit()` decides what they get. Okta/CAS later is
another provider into the same `admit()`. The service-role key never leaves
the server.

### D-023 · Shared test teacher login — test-only, remove before the pilot
*2026-10-29, Nathan.* `TEST_TEACHER_EMAIL` / `TEST_TEACHER_PASSWORD` sign in as
staff (constant-time compare) so testers can try the teacher side without an
allowlist entry. Must be removed before any real student uses DALAA.

### D-024 · Students may sign up themselves; accounts link by email
*2026-10-29, Nathan.* Amends "sign-in never creates a student"
(`docs/CANVAS.md`). A student may create their own account (school email only,
D-022). An LTI launch, roster sync or signup whose email matches an existing
user attaches to that user — never a second account. `users.external_id` stays
the one identity key. Staff are still never created by sign-in alone (D-018,
except LTI instructors per D-020).

### D-025 · Login IDs may be emails on non-BYU Canvas
*2026-10-29, Nathan.* On gitgrade, Canvas `login_id` is an email. Identity
accepts lowercased email-shaped login IDs as well as BYU NetIDs; both live in
`users.external_id`. Practice NetIDs keep their `practice.` prefix.

### D-026 · AI through Vercel AI Gateway, models chosen by env
*2026-10-29, Nathan.* All model calls go through one module (`src/ai/`) using
the AI SDK with AI Gateway model strings: `CHAT_MODEL` (Gemini) for the student
chat, `GRADER_MODEL` (OpenAI) for drafting settings and grading. Production
authenticates with Vercel OIDC; local uses `AI_GATEWAY_API_KEY`. One ledger row
per real call; cost NULL when unknown, never 0.

### D-027 · A Study Chat attempt starts with the first message
*2026-10-29, overnight build (T21d); Nathan to confirm.* Opening the chat
page writes nothing. The attempt, and its time limit, start when the student
sends their first message, so reading the material first doesn't eat into the
chat's time, and a student who only looks at the page isn't counted as
submitted or started. The page says so next to the time limit.

### D-028 · Free-tier AI Gateway models for testing
*2026-10-29, Nathan.* Amends D-026. AI Gateway's free credit ($5/month) only
serves older models, so testing uses `CHAT_MODEL=google/gemini-2.5-flash` and
`GRADER_MODEL=openai/gpt-5.2` (local, preview and production). Moving to newer
models (e.g. `gemini-3.8-flash`, `gpt-6.1-sol`) needs paid gateway credit and
only an env change.

### D-029 · Sign in without Canvas: set a password; a shared test student
*2026-10-29, Nathan.* Amends D-022 and D-023.
1. A signed-in user may set a DALAA password for the email already on their
   account (Settings → "Sign in without Canvas"). Canvas or an earlier sign-in
   already proved that email, so it needn't be a school domain; the form never
   takes an email. Self-service signup stays school-domain-only (D-022).
2. Password sign-in therefore accepts any email that has a Supabase account,
   and still goes through `admitByEmail` → `admit()`. Staff status still comes
   only from the allowlist or teaching an LTI course (D-020), never from having
   a password.
3. A shared test student, `TEST_STUDENT_EMAIL` / `TEST_STUDENT_PASSWORD`
   (test-only like D-023; remove before the pilot), signs in to the account
   with that email — the matching gitgrade Canvas user once a launch or roster
   sync has created it — always as a student, never staff.

### D-030 · A bug loop works through feedback reports; it merges only small fixes
*2026-10-29, Nathan.*
1. After testing, Nathan starts `ralph/bugs.sh` by hand. It takes one open
   feedback report per pass (bugs and confusing pages before ideas, oldest
   first) and runs until none is left. What it did is a row in
   `feedback_fixes` (`npm run feedback -- claim|record|resolve`), shown on the
   admin report page.
2. **Small fixes are merged and deployed by the loop; everything else becomes a
   PR Nathan merges.** Small means all checks green, no migration, nothing under
   `src/auth/`, `src/lti/`, `src/canvas/` or grade sending, no dependency
   changes, and under ~200 changed lines. This standing self-merge is only for
   the bug loop's small fixes; "don't merge your own PR" holds everywhere else.
3. Ideas are never built, only written down (`docs/IDEAS.md`) for Nathan.
4. The loop reads production's reports, so `list` and `show` run in a read-only
   transaction, and the writes touch only `feedback_fixes` and the report's
   resolve columns. No SQL by hand against production.

---

## Open

| # | Question | Owner | Notes |
|---|---|---|---|
| D-008 | First tool on the chassis: Case Chat or Quiz? | Scott | For the gitgrade test build, Study Chat (D-021). Still open for the BYU pilot. |
| D-011 | How does DAALAA relate to DALAA_v1? Replace, or port its code? | Scott / Nathan | DAALAA's `CLAUDE.md` still says "six tables, a type never adds a table" — reconcile with D-003 before any agent runs there. |
| D-012 | Does Explain move under Case Chat? | Scott | Scott's view in the meeting: yes. |
| D-013 | Canvas assignment creation opt-in per activity, or on by default? | Nathan | DAALAA plan says opt-in; simplicity argues for default-on with an off switch. For gitgrade, D-034: an explicit Assign creates it. Still open for BYU. |
| D-014 | Which attempt is authoritative for a grade push (latest accepted?) | Scott | REVISE complicates "latest". |
| — | BYU IT: personal tokens OK at multi-instructor scale? Records on Vercel? FERPA? Okta registration? | Nathan | In progress with a BYU Canvas engineer — see `conversations/2026-09-30-byu-canvas-engineer.md`. |
| — | Production hosting: Vercel + Supabase, or a BYU server? (D-015) Who runs `services.byu.edu`, can it run Postgres, can Nathan deploy? | Nathan / Scott | Decide before real student data. |
| — | Classic or New Quizzes at BYU? | Scott | Two different APIs for quiz import. |

### D-031 · An attempt keeps the settings it started under
*2026-10-29, overnight build (T39). Confirmed by Nathan 2026-10-29: no backfill.* Teachers can edit a
published Study Chat. When a student starts, their attempt stores a copy of the
activity's settings (`attempts.settings`): persona, completion, positions,
touchpoints, rubric and strictness. The chat, the completion checks, the
student's page and the grader read that copy, never the live settings, so an
edit applies to new attempts only. The review screen says so once anyone has
started ("N students have started; changes apply to new attempts only.").
Results already keep each criterion's label and max with its score.
Attempts from before the column existed are **left NULL, not backfilled**, and
read the activity's current settings: that keeps the migration additive (it can
reach production before the code) and those were test attempts anyway.

### D-032 · DALAA looks like Canvas; inside Canvas it draws no navigation of its own
*2026-11-08, Nathan.* Reference: Nathan's "DAALAA Course Tabs Mockup".
- **Canvas's look everywhere:** Lato, navy primary (`#002E5D`), grey borders,
  3–4px corners, underlined tabs, status pills. **Light only.** Canvas has no
  dark mode, so `dark:` is switched off. All of it lives in the tokens in
  `src/app/globals.css`.
- **Inside Canvas (a frame), Canvas's own menu and breadcrumb are the shell.**
  DALAA shows only its tabs and content (`src/components/embed.ts` reads
  `Sec-Fetch-Dest: iframe`). On its own, DALAA draws a Canvas-like navy rail.
- **Course switcher, outside Canvas only** (*2026-11-12, Nathan*, from
  teacher feedback e77d9cdb): the course name in the breadcrumb is a menu of
  the teacher's other courses. Picking one opens the same tab at its top (a
  results or material page opens that course's Results or Materials), or
  Activities from a page on no tab. A teacher with one course sees just the
  name. Inside Canvas, Canvas's course menu does this.
- **The DALAA tab is "Setup"; "+ Activity" is a menu** (*2026-11-12, Nathan*,
  feedback b352f412 and b6714065): the course tabs are Activities · Materials
  · Results · Setup. "+ Activity" opens a menu of every activity type (live
  ones start their first step, the rest say Coming soon), replacing the
  "What kind of activity?" page; old links to it land on Activities or
  Canvas's picker.
- **Search on Activities and Materials** (*2026-11-12, Nathan*): a Canvas-style
  "Search for …" box at the top left, across from "+ Activity" / "+ Materials".
  It filters the rows already on the page by title, in the browser
  (`src/components/list-search.tsx`), and keeps its text when the teacher
  switches views.
- **A Help tab after Setup** (*2026-11-12, Nathan*): "Ask the DALAA wizard"
  (a Preview until built, docs/IDEAS.md), Give feedback (opens the same panel
  as the Feedback button), and Latest release notes from
  `src/help/release-notes.ts`, written for teachers. A PR a teacher would
  notice adds its line there.
- **One course-menu entry, "AI Activities"** (`COURSE_MENU_LABEL`), with tabs
  inside it: Assigned Activities · Materials · Grading · DALAA. Canvas allows
  each tool only one menu entry, and three tools would mean three keys per school.
- Instructure UI was considered. The mockup is plain CSS, and the tokens get
  the look without a large dependency, so we're not using it for now.

### D-034 · Creating an activity is a 7-step wizard; activities take several materials; Assign makes the Canvas assignment
*2026-11-09, Nathan.* Reference: Nathan's "DAALAA Course Tabs Mockup" (D-032).
- **Wizard order:** 1 Materials · 2 Learning goal · 3 Activity type ·
  4 Scenario and persona · 5 Chat options · 6 Grading · 7 Review and assign.
- **Reworked to six questions** (*2026-11-13, Nathan*): 1 What should students
  read, and what should the AI know? · 2 What should students be able to do?
  (the goal and the kind of activity, suggested together in one call,
  "Suggested based on your reading") · 3 Who should the AI be? (scenario,
  opening message, persona) · 4 How will you know they got it? (key points to
  listen for, positions only when students take a side, how it's scored) ·
  5 How should the chat run? · 6 Review and assign. Next on step 2 drafts the
  chat; step 3 has "Skip to review". Kinds of activity are seven groups by what
  the student does (Explain / teach back, Apply, Argue, Question, Practice a
  conversation, Connect, Defend their work), each holding one or more of the
  existing modes as a "Style" (`wizard/types.ts`); settings still store the
  mode. Touchpoints are named "Key points to listen for" (a checklist that
  feeds Insights and student progress, no points) and the rubric "How it's
  scored" (only it makes the grade). Drafted situations stay under 120 words.
- **Step 2 puts the interaction first** (*2026-11-13, Nathan*, feedback
  084938dc): "How will students work through this reading?" shows all seven
  kinds as cards, each saying what students do and who the AI is (the
  suggested one first), then the learning goal, which DALAA grades against,
  then the length. The goal follows the kind: the first call suggests two
  kinds, each with its own goal; picking another asks for a goal for it
  (`suggestGoalFor`). A goal the teacher has typed is never replaced.
- **Fewest student messages** (*2026-11-13, Nathan*): optional on Chat
  options. Before it, answering the question doesn't end the chat and Finish
  is held back; the message and time limits still end it. Students see it in
  How it works and above the chat ("✓ Minimum reached"). Drafts leave it
  empty (the drafting schema can't carry a default); old settings read as none.
  Materials come first so the AI can **suggest the learning goal** from them,
  then **suggest the type** from the materials and goal. The teacher's goal is
  kept word for word; the AI drafts the rest around it.
- **Several materials per activity:** any number of readings students see with
  the AI, and any number of notes only the AI sees (`activity_materials`).
  Students never receive the AI-only notes.
- **Options in the mockup that don't exist yet are shown, disabled and marked
  "Coming soon"**, never hidden and never faked (list in `docs/IDEAS.md`).
- **The Library page is removed.** The rail is **Courses · Settings**;
  `/library` redirects to `/courses`. Reuse happens on a course's Activities
  tab: *Assigned*, then *Not assigned* and *From my other courses*, with a copy
  that brings its materials along.
- **Assign creates the Canvas assignment** with the teacher's Canvas
  connection (REST): name, points, due date, group, published or not, as an
  external-tool assignment that launches the activity, so grades return over
  AGS. Changing the due date in DALAA updates Canvas. Behind
  `ASSIGN_TO_CANVAS=1` until Nathan verifies it on gitgrade. This answers D-013
  for the gitgrade build: on when the flag is on, from an explicit Assign.

### D-035 · The Results tab is Insights · Grades · Disputes, and a teacher can read every conversation
*2026-11-12, Nathan.* The Results tab's main job is helping the teacher prepare
for class from what students said; grading and Canvas come second.
- **A switch, views first:** Insights · Grades · Disputes (n), each listing
  every published activity. Insights opens first.
- **Grades** keeps each student's score, the teacher's change, and Send grades
  to Canvas. A disputed grade links to Disputes instead of offering a score.
- **Disputes** lists open disputes oldest first (the longest-waiting student
  first), each answered with an optional reply and a kept or changed score,
  then the answered ones.
- **Every student's conversation** is readable at
  `/courses/[id]/grading/attempts/[attemptId]`: the grade with its evidence,
  the score or dispute form, and the transcript the tool draws
  (`transcript` in `src/tools/screens.ts`).
- **Insights read the shared results shape** (`src/results/insights.ts`), so
  they work for every tool with no tool code: graded attempts only, Canvas's
  Student View user left out. Positions and points raised are bars that open
  to what each student said (the grader's quote); the rubric shows the class
  average per criterion and marks the weakest. The tool's old live-tracking
  summary (`gradingNotes`) is gone.
- **The class-prep brief** (`src/results/brief.ts`): on "Analyze
  conversations", one call to the grader model reads every finished
  conversation (up to 200,000 characters) with the teacher's notes and
  returns confusions, strong ideas, students' questions and 3–5 questions to
  raise in class, each with the students it applies to. Students reach the
  model as S1, S2, …, never by name; quotes the student didn't write and
  labels the model made up are dropped. Kept in `class_briefs` until the
  teacher runs it again; the page says when more students have finished
  since. Ledger purpose `insights`. Tools give the text through
  `conversation` in `src/tools/screens.ts`; the quote check is shared with
  the grader (`src/results/quotes.ts`).
- **Insights, in steps:** positions and points covered with anonymous quotes,
  names revealed on a click (as in Make the Case); class averages per
  criterion; then an AI class-prep brief (confusions, strong ideas, questions
  students asked, discussion questions) that runs only when the teacher asks
  and is kept until they refresh it.
- **Update, 2026-11-16 (Nathan): one assignment at a time, takeaways first,
  as cheap as it works.** Insights opens on a card per assignment (finished,
  average, whether its takeaways are made); each opens its own page
  (`grading/insights/[activityId]`): four numbers (finished, average, weakest
  criterion, most-missed point), then the big takeaways (a summary sentence
  and the three findings that cover the most students, the rest a click
  away), then the numbers as pictures (score spread, rubric, key points
  including any nobody raised, positions). The numbers come from saved
  grades and cost no AI call. The brief now uses the chat model, reads each
  student's grade line instead of working out the numbers, and reads the
  AI's replies cut to 300 characters (`clip` in the tool's `conversation`);
  the students' words go in whole and quotes are still checked. Measured
  locally: 10 conversations for $0.010 (gpt-5.2 would be about $0.06).
  Discussion questions never carry a student label.
- **Ask about this assignment (2026-11-16, Nathan):** under the takeaways, the
  teacher asks questions and the chat model answers from the same
  conversations the brief reads, citing students as [S3] (shown as "Student
  3", or the name when names are shown, linked to the conversation)
  (`src/results/ask.ts`). The class comes first in the prompt and is the same
  for every question, so the provider's prompt cache can serve it; earlier
  questions live in the page, and the last 6 go back with a follow-up.
  Reasoning is "low": thinking is billed as output, and answering from the
  text in front of it doesn't need it (measured: $0.0016 a question against
  $0.0058). 30 questions a teacher a course a day, counted from the ledger
  (`insights.ask`).

### D-036 · Students see their goal and what they're graded on; a Study Chat is three steps
*2026-11-13, Nathan* (feedback abf69c71, ae27bc44).
- **A student sees the learning goal and the rubric's criterion names and
  points**, not what earns full points (a description can give the answer
  away). The situation, the persona's background, positions and
  touchpoints stay with the AI and the grader (`student-view.ts`).
- **Progress, when the teacher turns it on, names the points already
  covered** (the student said them), never the ones still to cover; messages
  and points are bars, pinned above the chat on a wide screen.
- **Three steps, one on screen at a time** (*same day, Nathan*: a page
  showing everything at once left students unsure where to look, and Canvas's
  frame is narrow): 1 Your task (goal, question, how it works, how it's
  graded) → 2 Read → 3 Chat, which becomes Your grade once it ends. A step
  bar shows where the student is and goes back to any step; every step stays
  mounted, so rereading mid-chat keeps the chat and a half-typed message. A
  student who has started opens on Chat. The chat's question is the
  character's (often written in their voice) and they ask it in the chat, so
  it appears nowhere else. Above the chat: "Messages left before the chat
  ends" counting down (the limit is a maximum) and "Key points you've made". One column, so it fits inside Canvas. (This replaced a two-column
  version shipped earlier that day.)

### D-037 · The teacher writes; DALAA drafts when asked
*2026-11-16, Nathan* (feedback aab2aed5, 04c68408, 3a3b2402; Lucy's 016b4768
and bc22f7df asked for the same).
- **Step 2's Next no longer drafts the whole chat.** It saves the kind, goal
  and materials at once (`startStudyChat`), and steps 3–4 open empty. This
  changes CLAUDE.md's "a blank field is never a screen's primary state": the
  primary state is now an empty step with one obvious **"Draft this page with
  DALAA"** button (and an optional line of direction for it), so the
  one-click path stays. With some boxes written, it becomes "Fill in the empty
  boxes" and keeps to what the teacher wrote.
- **Every text box and list has a DALAA button** (`parts.ts`, `assist.ts`):
  Draft when empty; Tweak when filled, with a small box for what to change.
  It stays after every answer. One box uses the quick chat model; a list or a
  page uses the grader's. Nothing is saved until the teacher saves the step.
- **A draft may be saved part-written** (`StudyChatSetupSettings`: the same
  settings, any text may be empty, no criteria yet; points NULL until there
  are criteria). Publishing, trying and running a chat still need the complete
  schema; Review and assign lists what's missing instead of the trial and
  Assign. A published chat's edits must stay complete.
- **"About how long?" moved to Chat options**, as buttons that set "Most
  student messages" (the choice itself isn't stored). New chats start at 12
  messages, no time limit, students can finish.
- **Step 2's goal follows the same rule** (*2026-11-22*, Lucy's feedback
  78c8594e): the box starts empty, with Draft (the goal the suggestion wrote
  for the chosen kind, else one written now) and Tweak (rewrite the
  teacher's goal as asked). Picking another kind never changes the goal.
- **New chats start with progress shown and students choosing typing or
  speaking** (*2026-11-22*, Lucy's 9abab88c: what she picks every time).
- **Steps 1–2 open on a saved chat** (*2026-11-22*, Lucy's 21e8c594): its
  materials (ticked as they are) and its kind and goal ("Current kind" leads)
  can change in place. Nothing on steps 3–6 is redrafted; Draft and Tweak
  there rewrite for a new kind. Step 3's Back goes to step 2.
- **One reminder for unfinished drafts, on Assigned only** (*2026-11-27*,
  Nathan, Lucy's b0f7f57b): the Activities tab's per-draft "You're still
  setting up …" became one line, "2 activities aren't finished. See them ›",
  linking to Not assigned, which already lists the drafts (so none shows
  there or on From my other courses). ✕ hides it until a new draft appears;
  "Remind me tomorrow" hides it for a day.

### D-038 · Students can speak their messages (dictation)
*2026-11-17, Nathan*
- **Chat options has "How students answer": Typing, Speaking, or Their
  choice.** Typing is the default, and chats saved before this are typing.
  With Their choice, the student switches between Type and Speak above the
  message box.
- **Speaking is dictation, not a voice conversation.** The student presses
  Speak, talks (up to 2 minutes), presses Stop, and what they said lands in
  the message box for them to check and fix before they send it. The chat,
  its limits and its grading are exactly the same as typing. A spoken
  back-and-forth with the character ("Voice conversation", real-time audio)
  stays Coming soon on Chat options.
- **The browser records; our server transcribes** through the AI Gateway
  (`dictationModel()`, `openai/gpt-4o-mini-transcribe` unless
  `DICTATION_MODEL` says otherwise; about $0.003 a minute). Chosen over the
  browser's own speech recognition, which is free but missing in Firefox and
  sends students' voices to Google outside our ledger. The audio isn't kept.
  Each transcription is an `ai_calls` row ('chat.dictate'); a student gets
  200 a day.

### D-039 · Students see a PDF reading as its pages
*2026-11-17, Nathan ("make this PDF actually look like the PDF")*
- **A reading's PDF is kept** (`content_files`, read and written only by
  `src/content/files.ts`) and the student's Read step draws its pages with
  pdf.js (`src/content/pdf-pages.tsx`), so layout, headings, tables and
  pictures look as the teacher made them in every browser, Canvas's frame
  included. The browser's own PDF viewer was passed over: Android Chrome and
  iOS Safari in a frame don't show PDFs inline.
- **The text stays what the AI reads**, and is one click away ("Show as
  text") for screen readers, translation and small phones. If the pages
  can't be drawn, the text shows instead. Pages load only once the reading
  is on screen.
- **PDFs only, uploaded or picked from Canvas from now on**; AI-only notes
  keep no file (students never see them). Earlier readings show as text
  until re-added: their files were never kept. Word and PowerPoint still
  show as text.
- **Stored in Postgres as bytea** (4 MB cap, the upload limit) behind that one
  module, so it can move to object storage later without touching callers.
  The file is served only to a student who can take the activity or a
  teacher of its course, and only when it's a reading of that activity.

### D-040 · The student chat looks like a chat app
*2026-11-17, Nathan ("make this chat more inviting … similar to ChatGPT, Claude or Gemini")*
- **One slim header** with the character's initials, name and role, and the
  meters as small labelled pills ("Messages left 11 of 12", "10 min left").
  The big meter card is gone.
- **The character's messages are open text beside its initials; the
  student's sit in a bubble on the right.** Three dots show while the reply
  is coming. Teachers' transcripts and the practice run use the same look.
- **One rounded message box** that grows as the student writes, with the
  microphone and a round send arrow inside it. This replaces D-038's
  Type/Speak switch: with Speaking or Their choice the microphone is simply
  there, and the student can always type or fix words.
- **Progress gets its own "Your progress" column beside the chat**
  (Nathan, same day: "better indicators … separate from the chat", then
  "put it on the side so the chat is the first area of interest"). From
  tablet width up, Canvas's frame included, it's a slim column to the right
  that stays in view; the student pages are `max-w-5xl` to make room, and
  every other step keeps to reading width (`max-w-3xl`). On a phone it's one
  slim strip above the chat ("11 of 12 messages left · 30 min left · 2 of 5
  key points"). Each count is a number, what it's out of, and a bar: messages
  left, time left, key points made (only the ones made are named); the
  minimum and the position sit under them. Red at 2 messages or 2 minutes.


### D-041 · Teachers can delete materials and activities, after a confirm

*2026-11-20, Nathan ("let the teacher delete materials and assignments …
there should be a popup to confirm deletion"), from Lucy's feedback 2a78bb40
and 13e17f3f*
- **A trash button on each Materials row and each Activities row** opens a
  dialog that says what goes. Cancel has the focus, and only its red Delete
  deletes. Deleting is permanent; nothing is kept for undo.
- **A material that a published activity uses can't be deleted.** The dialog
  names the activity, and the teacher takes the material out of it first, so
  students partway through never lose their reading. Drafts that use it just
  lose it. For a Canvas Page or File, only DALAA's saved copy goes; it's
  still listed from Canvas.
- **Deleting an activity deletes everything students did in it** (chats,
  grades, disputes, records of grades sent). Once anyone has started it, the
  dialog shows how many, and Delete stays off until the teacher ticks "Also
  delete N students' chats and grades". The server checks this too.
- **DALAA doesn't change Canvas when deleting.** An activity in Canvas
  Assignments stays there until the teacher deletes it in Canvas (the dialog
  says so), and grades already sent stay in the gradebook.
- Not yet: deleting several at once, and moving them into modules (also in
  that feedback).

### D-042 · "Your feedback" on the Help tab, and colored markup

*2026-11-22, Nathan ("add a list of open feedback in the help section …
crossed off/marked resolved when they are fixed … still different than
release notes"), from Lucy's feedback 3df5d2ca, 107d2eb9 and deead2c3*
- **The Help tab lists the reports the signed-in teacher sent**, under Open
  and Done. Each says where it stands: Received, Being worked on, Waiting on a
  decision, Fixed and coming in the next update, Fixed (crossed off, with the
  date), or Closed without a change. A teacher sees only their own reports,
  with no screenshots and none of the fixer's notes, which are written for
  the team. **An admin sees everyone's by default** (Nathan, same day: "i
  want to see everyones"), with who sent each and a link to it in the
  Settings inbox, and can switch to just their own.
- **Filters follow the course tabs** (Nathan, same day: "the filters should
  be the tabs … then dropdown categories"): pills for All, Activities,
  Materials, Results, Setup, Help and Other, each with how many are still
  open, worked out from the page each report was sent on
  (`src/feedback/area.ts`). Under them, dropdowns: the tab's sections (e.g.
  Results: Grades, A student's chat, Insights), type, and priority.
- **Every report has a priority:** Urgent (p0, blocks teaching or students
  now), Soon (p1, fix this week) or Can wait (p2). The reporter picks it when
  sending, Soon preselected; an admin can change it from the list or the
  inbox. Reports sent before it existed show "Not set" until triaged. Open
  reports sort Urgent first, and `npm run feedback -- list` puts them first
  too, so the bug loop takes urgent ones first.
- **Each priority has its own color everywhere it shows** (Nathan, same
  day): Urgent red, Soon amber, Can wait blue, Not set dashed grey
  (`src/components/priority-tone.ts`). The team triages from the command line
  with `npm run feedback -- priority <id> <p0|p1|p2|none>`.
- **It's not the release notes.** A report is crossed off when it's resolved
  (`npm run feedback -- resolve` or the admin inbox). The release notes still
  list every change, whether or not someone asked for it.
- **Screenshot markup has three named colors**, red, blue and green, so a
  note can say "the blue box". Red is the default.

### D-043 · Teachers open, read and edit their materials

*2026-11-22, Nathan ("lets fix 2 urgent reports"), from Lucy's feedback
8697eb90 (urgent) and 04454477*
- **Every saved material has its own page** (the title in Materials links
  to it). It shows the material the way students read it: a PDF as its
  pages, anything else as its text. It also shows where the material is used
  and when it was added and last edited.
- **Edit changes the name and the text**, with a live preview beside the
  text on a wide screen (the side-by-side Lucy asked for, after MakeTheCase
  and Quizzer). A PDF's pages stay as uploaded; editing changes its text,
  which the AI reads and "Show as text" shows. The page says so, and says
  when students can already open an activity that uses it, since they'll see
  the change right away. Same 100,000-character limit as uploads.
- `course_content` and `course_guides` gain a nullable `updated_at`; the
  Materials list's Updated column shows it, or when the material was added.

**Insights says when it leaves test chats out** (feedback 309e6e3a, same
day). Chats from Canvas Student View are a teacher's own tests, and Insights
has always left them out of the class. It did that silently, so Lucy's
graded test looked lost. The Insights card and the assignment page now say
"1 test chat from Canvas Student View isn't counted here … See it under
Grades".
- **Adding a material opens it to check** (*2026-11-22*, Lucy's 6c0bf4e4,
  2e01b6f9, c4e4aef5): upload, paste or web page lands on its page as
  students see it (a PDF as its pages), with Edit (the side-by-side editor)
  and "Looks good", which goes on to where the teacher came from (step 1 of
  a new activity, with it ticked; else Materials). It is saved first, not
  held unsaved: the page and editor already exist, and Delete undoes it.
- **Readings render their Markdown** (Lucy's ffcdcaf9): headings, lists,
  quotes, rules and emphasis show as formatting for students, on the
  material's page and in the editor's preview, built as elements, never
  HTML (`reading-blocks.ts`).

### D-044 · Results: one assignment at a time, the latest submissions first

*2026-11-22, Nathan ("lets fix the results tab … prioritize ease of use,
clear and understandable user experience"), from Lucy's feedback 12f80baa,
2154c3d7, c7ef8807 and 8502b57c*
- **Grades lists assignments, not every student under every assignment.**
  Each row shows when someone last finished it, how many are graded, being
  graded and disputed, and when grades last went to Canvas. A click opens that
  assignment's own page (`/grading/grades/:activityId`): counts for graded,
  being graded, in progress and not started; the students who finished
  (disputed first), with In progress, Not started and Everyone a click away;
  and Send grades to Canvas with when it was last sent. Before, it was one
  page of about 75 rows, and the assignment needing attention could be
  anywhere.
- **The latest submissions first**, on Grades and on the Insights cards.
  Assignments no one has finished come last, soonest due first.
- **Results links go to the assignment**: the Activities tab's Results, the
  student's chat page's "← Grades", Insights' "Grades", and Send to Canvas all
  land on that assignment's grades page.
- **Search** on Grades and Insights. Scores move by half a point. The
  Insights score chart splits the low end into Under 40%, 40s and 50s.

### D-045 · Changing a grade: a reason the student sees, and grading straight through

*2026-11-22, Nathan, from Lucy's feedback ae234e89*
- **Scores move by half a point** (they moved by 0.01).
- **"Why you changed it"** on the student's chat page: optional, up to
  2,000 characters, saved with the teacher's score (`results.teacher_note`)
  and shown to the student under "Your teacher set this grade". Putting the
  AI's score back clears it.
- **"Polish with AI"** rewrites the teacher's words more clearly and kindly
  (the chat model, purpose `grade.note`; nothing is saved until Save). The
  first try reversed a note's meaning: it read "ai missed u said the stars r
  states" as the student not saying it. So the AI now gets the scores before
  and after, the instructions say "the AI" means the first grading, it gets a
  worked example, and an **Undo** puts the teacher's own words back.
- **The chat page grades a class straight through:** Previous and Next across
  the students who finished ("3 of 10 finished", disputed first, as on the
  grades page), and on a wide screen the grade sits beside the conversation
  and stays in view while reading.

### D-046 · One Gradebook: every grade, its Canvas state, and disputes, on one page

*2026-11-22, Nathan ("grades and disputes should all be one tab … there
should be no clicking into another window … extremely clear what is pushed to
Canvas and what is not"), after Canvas's own Gradebook. Replaces D-044's
per-assignment grades page and the separate Disputes view.*
- **Results is Gradebook · Insights.** The Gradebook is a grid: students down,
  published assignments across (latest submissions first), "Out of N" under
  each title, with student and assignment search and a Show filter (every
  student, grades not in Canvas, disputed grades).
- **Every grade says where it stands with Canvas**, worked out from the last
  score Canvas confirmed (`grade_push_lines`, status `sent`) and the score
  that counts now:
  - ✓ In Canvas: Canvas has this score.
  - Not sent: graded, never sent.
  - Changed, not sent: sent, then changed in DALAA, so Canvas has the old
    score.
  - Disputed (red) shows as well as the Canvas state.

  A legend sits above the grid. The top of the page says how many grades
  aren't in Canvas, or that every graded score is. Each column has "N not in
  Canvas" and Send to Canvas (or "All in Canvas"). The button doesn't promise
  a count, since Canvas may refuse some (CLAUDE.md's push rules are
  unchanged). A course not connected to Canvas says grades stay in DALAA and
  shows no Canvas marks.
- **Clicking a grade opens it beside the grid** (`?open=`), on the same page:
  its Canvas state in a sentence, the score with "Why you changed it" or the
  dispute to answer, the grader's breakdown, the conversation, and Previous
  and Next student down the column. Saving keeps it open. Old links (a
  student's chat page, Grades, Disputes, an assignment's grades) land here.
- **The counts sit in the toolbar, not above it** (Nathan, same day: the
  two notices "take up too much room and are the first thing that is
  seen"): "N not in Canvas" (amber) and "N disputed" (red) are buttons beside
  the searches. Each shows only those students and turns off with a second
  click, replacing the Show menu. "All in Canvas" (green) shows when nothing
  is waiting. The legend is a "What the marks mean" popover. The grid starts
  right under the searches.
- **Canvas Student View stays marked:** a roster sync only ever sets
  `student_view`, never clears it, so a class list that leaves out the
  TestUser role can't turn a test user back into a student. Two students
  with the same name show their login IDs.
