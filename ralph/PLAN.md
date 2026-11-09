# Creation wizard, several materials, reuse, Assign to Canvas

*Approved by Nathan 2026-11-09. Source of truth for this loop; the task list is
`ralph/TASKS.md`, the running log is `ralph/PROGRESS.md`. The previous run
(Study Chat over LTI, 2026-10-29) is in `ralph/archive/2026-10-29-study-chat-lti/`.*

## Goal
Make creating and reusing activities match Nathan's mockup ("DAALAA Course
Tabs Mockup", Canvas look, D-032):

1. **A 7-step wizard**: 1 Materials · 2 Learning goal · 3 Activity type ·
   4 Scenario and persona · 5 Chat options · 6 Grading · 7 Review and assign.
   Materials come first so the AI can **suggest the learning goal** from them,
   then **suggest the type** (Study Chat mode) from materials + goal.
2. **Several materials per activity**: any number of "Students + AI" readings
   (`course_content`) and "AI only" notes (`course_guides`); Canvas Pages and
   Files picked straight from the list (saved on pick with `saveFromCanvas`).
3. **The Activities tab** (course page, "Assigned Activities"): *Assigned* on
   top; below it a filter: *Not assigned* (this course: drafts and activities
   with no Canvas assignment) and *From my other courses* (every activity the
   teacher made in other courses/semesters). Copying from another course
   brings its materials along. Lucy's ideas 45605e53, 19b72dae, fd8358d1.
4. **The top-level Library page is removed**: the rail is Courses · Settings;
   `/library` redirects to `/courses`.
5. **Assign = DALAA creates the Canvas assignment** with the teacher's Canvas
   connection (Canvas REST): same name, points, due date, assignment group,
   published or not; it is an external-tool assignment that launches the
   activity, so grades flow back over AGS as today. Changing the due date in
   DALAA updates Canvas. Behind `ASSIGN_TO_CANVAS=1` until Nathan verifies it on
   gitgrade.

## Decisions to respect
- Type step: the AI's pick is marked **Suggested** with its one-line reason; the
  next 2 are cards; every other mode is under **More types**.
- Options in the mockup that don't exist yet are **shown, disabled, marked
  "Coming soon"**: hints, reading beside the chat, minimum exchanges,
  criterion-by-criterion feedback, allowed attempts, score to keep, activity
  group, start from a copy (in the wizard), saved rubrics / "Use a saved
  rubric", "Redraft with AI", Case Writer. Never fake them working.
- The **wizard side panel** ("DAALAA wizard") in this run shows a short note per
  step built from stored data (the type's reason, counts of what was drafted)
  plus the Coming soon chips. **No chat box and no one-click edits** (second pass).
- A blank field is never a screen's primary state (CLAUDE.md): the goal step
  opens pre-filled by `suggestGoal`; steps 4–6 open on the AI's draft.
- Students get readings only, never AI-only notes: not fetched, not filtered,
  not fetched at all (CLAUDE.md).
- Wizard steps 1–3 keep their state in the URL (material ids, goal, minutes,
  mode) until the draft exists; from step 4 on the activity row is the state.
  "Save as draft" shows from step 4.

## Where things are (read before changing)
- Create flow today: `src/app/(teacher)/courses/[courseId]/activities/new/`
  (tool picker) → `new/[tool]/page.tsx` → `src/tools/study-chat/create-screen.tsx`
  (`StudyChatCreate`), forms in `forms.tsx`, actions in `actions.ts`
  (`saveMaterialAction`, `draftAction`), drafting `draft.ts` (`draftSettings`,
  `draftPrompt`), creation `create.ts` (`createStudyChat`, `publishStudyChat`).
- Review/edit today: `activities/[activityId]/page.tsx` → `review-screen.tsx`
  (`StudyChatReview`) → `editor.tsx` (`StudyChatEditor`, cards keyed
  goal|scenarios|positions|touchpoints|persona|completion|rubric; `fields.ts`
  `FIELDS`/`cardOf`), `trial-panel.tsx` (sample student), `guide-panel.tsx`.
- Settings schema `schema.ts` (`StudyChatFields`, `StudyChatSettings`,
  `rubricPoints`), modes `modes.ts` (`MODE_SLUGS`, `MODES`).
- Material readers: `chat.ts` (`chatSystemPrompt`, `aiGuide`), `grade.ts`
  (`gradePrompt`), `trial.ts`, `student-view.ts`, helpers `material.ts`
  (`fence`, `guideHeading`). Content: `src/content/store.ts` (`saveContent`,
  `getContent`), `guide.ts` (`saveGuide`, `getTaughtGuide`, `aiGuide`),
  `materials.ts` (`listCourseMaterials`, `mergeMaterials`), `read.ts`.
- Activities: `src/activities/store.ts` (`createActivity`, `getTaughtActivity`),
  `queries.ts` (`listCourseActivities`, `listLibraryActivities`).
- Canvas: `src/canvas/client.ts` (all Canvas HTTP), `connection.ts`
  (`clientFor`), `content.ts` (`listCourseCanvasContent`, `saveFromCanvas`),
  practice fake `src/canvas/practice/`. LTI launch: `src/lti/launch.ts`
  (`linkedActivity`, custom field `activity_id`), deep linking `deep-link.ts`.
- AI: `src/ai/call.ts` (`generateStructured`, ledger `ai_calls`; purpose is
  free text like `suggest.goal`), models `src/ai/models.ts`.
- UI: tokens in `src/app/globals.css`; `src/components/ui.tsx`, `tabs.tsx`,
  `preview-note.tsx`; course tabs in `courses/[courseId]/layout.tsx`; rail in
  `src/components/main-nav.tsx`; Materials tab `courses/[courseId]/materials/`.

## Facts that shape the code
- Next 16 (read `node_modules/next/dist/docs/` before an unfamiliar API).
- Tests use PGlite and mock AI/Canvas; no network. **Local Node is 20**, so
  `src/content/read.test.ts`'s two PDF tests fail locally (`Array.fromAsync`);
  CI (Node 22) passes them. Those two are the only acceptable local failures.
- Canvas REST quirks: sending `''` for a date clears it; follow `Link` paging;
  403 can be throttling. External-tool assignment via REST:
  `POST /api/v1/courses/:id/assignments` with `assignment[submission_types][]=external_tool`,
  `assignment[external_tool_tag_attributes][url]=<APP_URL>/api/lti/launch?activity_id=<uuid>`,
  `[new_tab]=false`, plus name, points_possible, due_at, lock_at,
  assignment_group_id, published. The LTI 1.3 launch for it may not carry our
  `activity_id` custom field, so `linkedActivity` also reads it from the
  launch's target link URI query.
- Production and preview share one database. Migrations must be additive and
  are applied to production **before** the merge that needs them.

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

