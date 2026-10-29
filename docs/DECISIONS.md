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

---

## Open

| # | Question | Owner | Notes |
|---|---|---|---|
| D-008 | First tool on the chassis: Case Chat or Quiz? | Scott | For the gitgrade test build, Study Chat (D-021). Still open for the BYU pilot. |
| D-011 | How does DAALAA relate to DALAA_v1? Replace, or port its code? | Scott / Nathan | DAALAA's `CLAUDE.md` still says "six tables, a type never adds a table" — reconcile with D-003 before any agent runs there. |
| D-012 | Does Explain move under Case Chat? | Scott | Scott's view in the meeting: yes. |
| D-013 | Canvas assignment creation opt-in per activity, or on by default? | Nathan | DAALAA plan says opt-in; simplicity argues for default-on with an off switch. |
| D-014 | Which attempt is authoritative for a grade push (latest accepted?) | Scott | REVISE complicates "latest". |
| — | BYU IT: personal tokens OK at multi-instructor scale? Records on Vercel? FERPA? Okta registration? | Nathan | In progress with a BYU Canvas engineer — see `conversations/2026-09-30-byu-canvas-engineer.md`. |
| — | Production hosting: Vercel + Supabase, or a BYU server? (D-015) Who runs `services.byu.edu`, can it run Postgres, can Nathan deploy? | Nathan / Scott | Decide before real student data. |
| — | Classic or New Quizzes at BYU? | Scott | Two different APIs for quiz import. |
