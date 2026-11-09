# Study Chat test build: what we're building and why

*Approved by Nathan 2026-10-29. Source of truth for the overnight loop; the task
list is `ralph/TASKS.md`, the running log is `ralph/PROGRESS.md`.*

## Goal
A working product to test inside Nathan's own Canvas
(https://gitgrade.opencanvaslms.org, he is admin) as an **LTI 1.3** tool:
a teacher creates a **Study Chat** assignment from course content, AI suggests
its settings, students read and chat, an AI grader scores the transcript,
students see grades and can dispute, and the teacher sends grades to the Canvas
gradebook. Canvas keeps doing what it already does (roster, gradebook, content);
DALAA pulls what it needs and doesn't rebuild it.

Built on the existing DALAA_v1 chassis (Next 16, Postgres, sessions, `admit`,
scope builder, courses/sections/members, Canvas client module). The REST/token
path stays for BYU alongside LTI. LTI code is written fresh: **nothing is
copied from `~/Desktop/volli/scholarly`** (keeps that IP separate).

## Already set up (do not redo)
- gitgrade **LTI Developer Key** "DALAA", Client ID `10000000000013`, ON,
  installed account-wide, Deployment ID `17:5d5bf5fb3c61c11a37a8b8b7b5d7876cfe1dba26`.
  Configured by JSON: OIDC login `https://dalaa-v1.vercel.app/api/lti/login`,
  target/redirect `https://dalaa-v1.vercel.app/api/lti/launch`, JWKS
  `https://dalaa-v1.vercel.app/api/lti/jwks`, scopes AGS (lineitem,
  lineitem.readonly, result.readonly, score) + NRPS contextmembership.readonly,
  custom fields `login_id=$Canvas.user.loginId`, `canvas_course_id=$Canvas.course.id`,
  `canvas_user_id=$Canvas.user.id`, privacy public, placements
  course_navigation (ResourceLink) and assignment_selection (DeepLinking).
- gitgrade **API Developer Key** "DALAA API", Client ID `10000000000014`, ON,
  redirect URIs `https://dalaa-v1.vercel.app/api/canvas/oauth/callback` and
  `http://localhost:3000/api/canvas/oauth/callback`. Secret is
  `CANVAS_OAUTH_CLIENT_SECRET` (Nathan adds it; may be missing — then the Canvas
  pages/files task is BLOCKED and teachers use upload/paste).
- **Test course** "DALAA Test" = gitgrade course id **42**, Nathan (Canvas user
  140, login_id `nathanmccauley10@gmail.com`) is teacher, published page
  `case-harbor-bikes` (a short fictional business case). Students are tested
  with Canvas **Student View**.
- **Env** (in `.env.local` and Vercel production + preview; never print values):
  `AI_GATEWAY_API_KEY` (local only; prod uses Vercel OIDC), `CHAT_MODEL`
  (`google/gemini-3.8-flash`), `GRADER_MODEL` (`openai/gpt-6.1-sol`),
  `LTI_PRIVATE_KEY` (base64 of a PKCS8 PEM RSA key), `LTI_PLATFORM_URL`,
  `LTI_CLIENT_ID`, `LTI_DEPLOYMENT_ID`, `CANVAS_OAUTH_CLIENT_ID`,
  `CANVAS_BASE_URL` (gitgrade), `APP_URL` (localhost locally, dalaa-v1 in prod),
  `TEST_TEACHER_EMAIL` (`teacher@dalaa.test`), `TEST_TEACHER_PASSWORD`,
  `SCHOOL_EMAIL_DOMAINS` (`byu.edu`), Supabase: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Facts that shape the code
- **Identity on gitgrade is an email.** Canvas `login_id` there is an email
  (`nathanmccauley10@gmail.com`), but `normalizeNetId` in `src/auth/admit.ts`
  rejects `@`. Identity must accept email-shaped login IDs (lowercased) while
  BYU NetIDs keep working. `users.external_id` stays the one identity key.
- **Issuer:** self-hosted Canvas usually signs launches with
  `iss = https://canvas.instructure.com` while its endpoints live on the host:
  auth `${LTI_PLATFORM_URL}/api/lti/authorize_redirect`, token
  `${LTI_PLATFORM_URL}/login/oauth2/token`, JWKS
  `${LTI_PLATFORM_URL}/api/lti/security/jwks` (verified: 200). Accept the `iss`
  from the OIDC login request only if it is in an allowed list
  (`https://canvas.instructure.com`, `LTI_PLATFORM_URL`); store and log the one
  actually seen (never log tokens).
- **Inside the Canvas iframe** the session cookie needs `SameSite=None; Secure`
  in production. Don't rely on cookies for OIDC state: keep state + nonce in
  Postgres (expiring rows). If the session cookie still doesn't stick, show an
  "Open DALAA in a new tab" button that carries a one-time, short-lived login code.
- **Signup without email:** students sign up with Supabase Auth through the
  admin API (`auth.admin.createUser({ email, password, email_confirm: true })`
  with the service-role key, server side only), so no confirmation email is sent.
  Only `SCHOOL_EMAIL_DOMAINS` emails may sign up. Supabase only proves the
  identity; `admit()` decides. Okta/CAS later = another provider into `admit()`.
- **Shared test teacher:** `TEST_TEACHER_EMAIL` / `TEST_TEACHER_PASSWORD`
  (constant-time compare), admitted as staff. Test-only; recorded as a decision
  to remove before the pilot.
- **Account linking by email:** an LTI launch, roster sync or signup whose email
  matches an existing user attaches to that user. Never create a second account.
- **AI** goes through one module `src/ai/` using the AI SDK (`ai`) with Vercel AI
  Gateway model strings from `CHAT_MODEL` / `GRADER_MODEL`. One ledger row per
  real call; cost NULL when unknown, never 0. Tests mock the model.
- **Grades** follow existing rules (`CLAUDE.md`, `docs/CANVAS.md`): explicit
  teacher push, unconfirmed is never recorded as sent, a grade changed in Canvas
  is reported not overwritten, a points mismatch refuses. Sent through LTI AGS.

## Study Chat (the first tool)
Content the student reads, then a chat. Settings (one JSON schema,
`src/tools/study-chat/schema.ts`, every field has an AI-drafted default and a
plain-language label):
- **Content**: what students study (Canvas page/file, upload, or pasted text).
- **Goal**: the learning objective.
- **Scenario**: what the chat is about and how it unfolds. (Stages/Phases are a
  later feature; the schema leaves room: `scenarios: Scenario[]`, v1 uses one.)
- **Positions**: alternative directions a student may take (e.g. for/against).
- **Touchpoints**: elements the teacher wants tracked (cost, culture, …).
- **Persona**: name/title, background, tone, strictness/helpfulness.
- **Completion**: turns, time, a question answered, or student finishes.
- **Rubric**: criteria the AI grader uses, plus grader strictness
  (strict · balanced · lenient).

**Modes** are presets that seed the AI's draft: Explain (Feynman: explain to a
beginner), Apply (apply a concept to a new situation), LikenToMe (apply to my
life), Case Chat (talk with the case protagonist), Debate (take and defend a
position, answer counter-arguments), Pitch (pitch an idea), Interview (practice
discovery/proposal interviews), Roleplay (communication/problem-solving
practice), Liken2Us (apply scripture to our lives), Socratic (expose and
question assumptions).

Reference for prompt and settings design (read, don't copy):
`~/Desktop/volli/MakeTheCase` — `types.ts` (CaseScenario),
`server/services/chatOptions.js` (DEFAULT_CHAT_OPTIONS, max_exchanges + action),
`server/services/chatPrompt.js` (`buildChatSystemPrompt`),
`server/services/chatPromptTemplates.js` (personas),
`server/services/promptBuilder.js` (`buildCoachPrompt`, JSON grading output),
`server/routes/caseWriter.js` (extract settings from uploaded content).
New in DALAA (MakeTheCase lacks them): touchpoints, "question answered"
completion, grader strictness, student disputes.

## UX
- Look like an extension of Canvas (clean, white, Canvas-like nav), using the
  existing tokens in `src/app/globals.css`.
- **The teacher must not be overwhelmed.** Upload content → pick a mode (or
  "Suggest for me") → AI drafts everything → review screen of short summary
  cards, each expandable to edit, plus a search box over all settings → Publish.
  Nothing blank. Advanced settings stay collapsed.
- Assignment types: **Study Chat** (live), **Quizzer** and **Oral Assessment**
  shown as "Coming soon".
- Teacher course page: Assignments · Grading (scores, edit, disputes, send to
  Canvas) · Students.
- Student: course → assignments (with grades) → assignment: directions, content,
  chat → result with per-criterion feedback → "Dispute this grade".
- **Feedback button on every page** (spec: `~/Desktop/volli/agent-team-kit/docs/FEEDBACK-LOOP-SPEC.md`):
  screenshot + URL + user + recent console errors + note → `feedback_reports`
  table → a `/fix-bug` skill in `.claude/skills/fix-bug/` reads a report.
