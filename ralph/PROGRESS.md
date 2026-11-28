# Progress

One entry per pass, newest last (PROMPT.md §3). Plan: `ralph/PLAN.md`.

## 2026-11-27 19:55 UTC · T01 Grade panel: each student's own score, and Feedback reachable · done
- Cause: Next/Previous re-renders the same server-rendered panel, so React reused the uncontrolled score input (`defaultValue`) and NoteField's `useState`. Fix: `key={attempt.id}` on `ScoreForm`/`DisputeForm` in `grading/grade-panel.tsx` (dispute answer box is inside the keyed form too). No action state to reset: the forms use plain server actions.
- Feedback tab (`src/components/feedback.tsx`) raised from z-30 to z-[60], above the panel (z-50) and its backdrop (z-40). The dialog itself is a modal `<dialog>` (top layer), so it already opened above everything.
- Browser check (local, course 1ce67d02, ralph.t04): typed 2 + a note on Hyrum (stored 5), Next → Ivy shows her own 9.5 and an empty note; Previous → Hyrum back to 5. Feedback tab hit-tests as topmost with the panel open at 1280 and 390 and opens its dialog. Nothing saved, local data unchanged.
- No unit test: the repo has no DOM test library and the fix is React reconciliation; verified in the browser instead.
- Release note under 2026-11-27.

## 2026-11-27 20:05 UTC · T02 "About how long?" buttons on Chat options · done
- Cause: the buttons worked (they set "Most student messages"), but nothing near them changed: no chosen state, the number sits below, and at Lucy's width (Edge, 1.25x) the labels wrapped into two lines over the next label. Clicking 10–15 on a 12-message chat changed nothing at all. Same code as her deployed commit e1b8bc0.
- Fix: `minutesForTurns()` in `wizard/query.ts` (tested); the matching length is filled and `aria-pressed`, labels `whitespace-nowrap` (`editor.tsx`).
- Browser check (local, ralph.t04, activity f37809f2): each length sets 4/8/12/20/30 and shows chosen; 5–10 + Next, reload shows 8 and 5–10 chosen; 1280 and 390 fine. Set back to 12 afterwards.
- Release note under 2026-11-27.

## 2026-11-27 20:13 UTC · T03 Material titles without file names · done
- `titleFromFileName` (`src/content/file-name.ts`, tested): drops the last extension, underscores → spaces; hyphens → spaces only when the name has no spaces (so "Dunning-Kruger Effect.pptx" keeps its hyphen); capitalization kept. CamelCase like "TruthAboutNegotiationsLeighfinal" is left alone (not split).
- Applied once in `readContent` (`src/content/read.ts`) for every file input (upload, Canvas file, wizard upload, student work); refusals still name the file. Optional `title` on file inputs: the upload form's new optional Title field; a Canvas file renamed without its extension uses its Canvas display name as title.
- Materials list (`src/content/materials.ts`): unsaved Canvas files show the tidied name, and saved Canvas files match under the old raw name or the tidied one, so no duplicate rows.
- Added page shows "Its name comes from the file's name; Edit to give it a better one." when `?named=file` (set by `reviewPath` when an upload had no title). Existing materials not renamed.
- Browser (local :3001, ralph.t04): `Harbor_bikes-case.md` with no title → "Harbor bikes case" + hint; with title → "Case: Harbor Bikes", no hint; form fine at 1280 and 390. Both test materials deleted afterwards. Release note under 2026-11-27.

## 2026-11-27 20:18 UTC · T04a Leaving an activity returns to its list · done
- T04 split into a/b/c in TASKS (three separate changes). This pass did (1), report a5b82cc1.
- Instead of carrying `?show=` through every link, the way back is the list the activity is in: `activityListPath(courseId, {assigned})` in `src/tools/catalog.ts` → `?show=unassigned` or `?show=assigned`. Used by ‹ Activities on the activity page, every wizard step and the Assign page, and by Save and finish later (`finishLaterPath` now takes the activity; the server actions look up whether it's assigned). Also right after a draft gets assigned. Delete already kept the view. There's no Cancel link in the wizard.
- Leaving an activity opened from *From my other courses* is T04b (banner and the way back).
- Browser (local :3001, ralph.t04): a Not assigned draft's wizard step, ‹ Activities lands on "Not assigned (7)" at 390px; a published unassigned activity's back and later links go to `?show=unassigned`, an assigned one's to `?show=assigned`. Nothing changed in local data.
- Release note under 2026-11-27.

## 2026-11-27 20:30 UTC · T04b Banner when an activity from another course opens · done
- *From my other courses* rows now link with `?from=<this course>`. `src/courses/origin.ts` (tested): `originCourse` accepts it only for a course the teacher teaches that isn't the activity's own (`getTaughtCourse` does the uuid and teaching check); `keepFrom`, `originListPath` (`?show=other`).
- Activity page and wizard step page show "This is in <code>, not <origin>. ‹ Back to <origin>" (`activities/[activityId]/origin-banner.tsx`), and their ‹ Activities goes back to the origin's *From my other courses*. Edit in the wizard, the wizard's resume redirect, step links and the review step's plain Save and finish later keep it. The step page passes the checked origin to the tool, so a made-up `from` never reaches a link.
- Not done, split to T04b2: a wizard step's save buttons (Next, step list, Save and finish later) go through server actions that redirect without `from`, so after the first save the banner is gone. Editing on the activity page itself (cards with Edit) doesn't navigate, so Lucy's main path is covered.
- Browser (local :3001, ralph.t04): from T04's other-courses list into a BUS M 499 draft: banner at 1280 and 390, ‹ Activities and Back → T04 `?show=other`; Edit in the wizard → `setup/scenario?from=…` with the banner; a made-up `from` shows no banner. No local data changed.
- Release note under 2026-11-27.

## 2026-11-27 20:31 UTC · T04b2 Keep the other course through the wizard's saves · done
- `PickerField` (`study-chat/forms.tsx`) also carries a hidden `from`; the editor, step 1's pick form and step 2's goal form pass the step page's checked origin.
- One redirect for every saved step: `savedStepRedirect` in `wizard/steps.ts` (tested in `setup-cards.test.ts`); `finishLaterPath` takes the origin and is what the step page's link uses too. `actions.ts`'s `afterSavedStep` loads the activity and re-checks `from` with `originCourse` (only a course the teacher teaches) before keeping it; `laterPath` is gone. Step 2's ← Back keeps it too.
- Browser (local :3001, ralph.t04): from T04's other-courses list, BUS M 499 draft 0ee3e13c step 3 Next → grading with `?from=` and the banner; Save and finish later → T04 `?show=other`. Step 2 Next keeps it; a made-up `from` has no banner or hidden field (390px). The saves wrote unchanged values; nothing else changed in local data.
- Not covered: "+ Materials" from step 1 and its way back to the step still drop `from` (the add-material return path); small, not in the report.

## 2026-11-27 20:37 UTC · T04c "Copied <date>" on other-course rows · done
- Nothing recorded copies, so new additive migration `20261127203241_activity_copied_from.sql`: nullable `activities.copied_from` → activities(id) `on delete set null`, partial index. Applied locally (twice: second "nothing to apply"); **goes to production at CHECKPOINT A (T06)**.
- `copyActivity` passes `copiedFrom` through `createActivity` (`NewActivity.copiedFrom`). `listOtherCourseActivities` returns `copiedAt`: the latest copy of that row in *this* course (copies into a third course don't count; deleted copies are forgotten). Tests in `copy.test.ts`, `queries.test.ts`.
- Row shows "✓ Copied <day>" and the button becomes "Copy again" (`courses/[courseId]/page.tsx`). Copies made before this change aren't recognized (no record of their source).
- Browser (local :3001, ralph.t04): copied a BUS M 499 draft into T04 → row says "✓ Copied Nov 27" + "Copy again" at 1280 and 390. Deleted the copy and the material it brought along; back to as before.
- Note: `npm run migrate` doesn't read `.env.local`; ran it with the README's local DATABASE_URL. Release note under 2026-11-27.

## 2026-11-27 20:43 UTC · T05 Delete from the wizard, and say what deleting touches · done
- One delete control for both places: `courses/[courseId]/delete-activity.tsx` (moved out of the course page). `ConfirmDelete` takes an optional `label` for a small text button instead of the trash icon. Returns to the list the activity is in (`show` from `assigned`), with "Activity deleted."
- Wizard: "Delete activity" sits in the setup page's top row, right of ‹ Activities (`setup/[step]/page.tsx`, chassis), so every step and every tool gets it without threading it through WizardShell; Save and finish later is just below it, Next is far away.
- Dialog facts come from `deleteFacts` + `deleteImpact` (`src/activities/delete.ts`, tested): started and finished counts, in Canvas Assignments or not (DALAA doesn't delete the Canvas assignment; students opening it get an error; grades sent stay), materials stay. The tick box wording moved there too.
- Browser (local :3001, ralph.t04): a throwaway draft (inserted locally, copied from "Second store") on step 3 at 1280 and 390: link top right, dialog lists the four facts; Delete → T04 `?show=unassigned&deleted=1` with "Activity deleted."; row gone. No local assigned activity with attempts to view that wording; covered by the unit test.
- Deleting an activity opened from another course lands on its own course's list, not the origin's. Release note under 2026-11-27.

## 2026-11-27 20:56 UTC · T06 CHECKPOINT A · done
- Lint, typecheck and tests green locally (102 files, 736 tests) on Node 22; branch was pushed and contained origin/main.
- One new migration since the last checkpoint, `20261127203241_activity_copied_from.sql` (nullable column + partial index, additive); `scripts/migrate-prod.sh` applied it, ended "migrations up to date".
- PR #196 (https://github.com/nmccaul/DALAA_v1/pull/196) auto-merged on green `ci-ok`; main HEAD a8af7d7. Production deployment for it READY; /api/health db up, /api/lti/jwks returns a key, / is 200.
- Resolved T01–T05's reports in production with that sha and PR: 7f546133, 9432d821, 28111d81, a5b82cc1, 12b101b4, f7026325, 9689e37b, 3f6eb879, 3b4df425.
- Branch pulled origin/main afterwards.

## 2026-11-27 21:03 UTC · T07 Activity type on each row · done
- Rows on Assigned, Not assigned and From my other courses now read "Study Chat · Argue · Debate" (the wizard's `typeName`) with the wizard's group icon. 04dcbd11's "icon mismatch" was the list using the tool's chat icon for every row while the wizard showed per-kind icons.
- Icons moved into `TYPE_GROUPS` (`wizard/types.ts`, `icon` per group; ssr imports) so step 2 and the list share them. Chassis stays tool-blind: `ToolScreens.kind` (`src/tools/screens.ts`, type in `src/tools/kind.ts`) and `describeActivity`; Study Chat's reader is `study-chat/kind.ts` (tested). The list queries now return `settings` whole, unread by the chassis.
- A draft with no mode yet (or old settings without one) falls back to "Study Chat" and the chat icon (seen on BUS M 499's one assigned activity locally).
- Browser (local :3001, ralph.t04): BUS M 499 Not assigned shows scales/question/teach-back icons and labels at 1280 and 390; T04's other-courses rows show the kind. No data changed.
- Not done (out of scope, in 04dcbd11): filtering or grouping the list by kind or Canvas module. Release note under 2026-11-27.

## 2026-11-27 21:08 UTC · T08 Setup page wording · done
- 1cb6be4f: one sentence, `AI_ONLY_EXPLAINED` in `src/content/guide-label.ts` (what AI-only notes are, with the negotiation example from her report), on the Setup tab's Materials line and in the Materials tab's help paragraph under the list (that tab's "Show" filters are by source, so there's no AI-only filter to attach it to).
- 62dab3f4: "Publish it to students" now links "Not assigned" (`activityListPath(…, {assigned:false})`) instead of the course page; its line says to open a draft there, try it as a student, then Assign or Publish on its last step. Create still goes to + Activity.
- 5bae9835: new short "Activities in Canvas modules" section on Setup: once it's in Canvas Assignments (Assign, or added from Canvas), add it to a module like any assignment (Modules, + on the module, Assignment).
- Browser (local :3001, ralph.t04, BUS M 499 Setup) at 1280 and 390: links go to + Activity and `?show=unassigned`, text wraps fine. No data changed. Release note under 2026-11-27.

## 2026-11-27 21:12 UTC · T09 Practice run: the sample student stops when the chat wraps up · done
- The trial already stopped at the message limit and the answered question; what it lacked was the real student's Finish. The sample student's prompt now says: once the AI has wrapped up (summed up, thanked, said goodbye) and asks nothing, write a short polite goodbye ending in `[END]` (`GOODBYE`, `readGoodbye` in `src/tools/study-chat/trial.ts`). The goodbye is sent, the AI answers it, and the run stops (`endedBy: "student"`, "the chat wrapped up and they said goodbye"). No extra model calls.
- Reuses the chat's own rules (`reachedMinimum` from `chat.ts`): a goodbye before the chat's minimum is just a message, and the question check now runs only from the minimum on, as for a real student (before, the trial could end on the question earlier than a real student could).
- Ends on the goodbye even when the teacher turned off "students can finish": a real student would just stop typing there, and a run that chats on is what Lucy reported.
- Tests in `trial.test.ts` (AI closes → stops within one more turn; early goodbye ignored; mark stripped). No browser check: nothing on screen changed but the ending line, and a real run costs AI calls; the next real practice run is the check. Release note under 2026-11-27.

## 2026-11-27 21:19 UTC · T10 Feedback inbox: Back, and "I think this is fixed" · done
- 42c212ac: report links in the Help tab's Everyone's feedback carry `?from=<that list, filters kept>`; the report page's back link reads "‹ Back to feedback" and returns there, else "‹ All feedback reports" to the inbox. `src/feedback/back.ts` (tested) accepts only a `/courses/<uuid>/help` path, nothing else; Mark resolved keeps it.
- 2e7b873b: "I think this is fixed" on the sender's own open reports (Help → Your feedback). It shows "Fixed? Waiting for an admin to confirm"; the report stays open. Admins see the same label in Everyone's feedback, a "They think it's fixed" tag in the Settings inbox, and "<name> thinks this is fixed (date). Check it, then mark it resolved." above Mark resolved; resolving works as before.
- Stored in new additive migration `20261127211416_feedback_reporter_fixed.sql` (nullable `feedback_reports.reporter_fixed_at`), not a fix status: `feedback_fixes` statuses belong to the bug loop, its check constraint has no room for it, and `fixed` would drop the report from `openReports`. `sayFixed` in `mine.ts` (tested: own open report only, first time kept). **Goes to production at CHECKPOINT B (T15).**
- Browser (local :3001, ralph.t04): button → label at 1280 and 390; as admin (local flag toggled and set back), filtered Help list → report → ‹ Back to feedback lands on the same filtered list; inbox tag shown. Cleared the test flag afterwards; local data as before.
- Release note under 2026-11-27.

## 2026-11-28 00:55 UTC · T11 Gradebook: one assignment at a time · done
- Each column's title in the Gradebook is now a link to `?assignment=<id>` (`gradebookPath`); with one picked, the grid shows only that column (by id, not a title search, so "First Offer" no longer also shows "First Offer, again") and the Assignment search is replaced by its title and "Show all assignments". Pure rule in `grading/columns.ts` (`shownColumns`, tested).
- Old links that already passed `?assignment=` (Insights' "grades", the grade panel's Close/Next, a Send to Canvas redirect) now land on the single column the same way, instead of a prefilled search box.
- Browser (local :3001, ralph.t04, BUS M 499): title click → one column at 1280; reload keeps it; 390px fine; Show all → all 3 columns. No data changed.
- Out of scope, still open in e76cb618: filtering the grid by Canvas module. Release note under 2026-11-27.

## 2026-11-28 01:01 UTC · T12 Send to Canvas: keep Canvas's reason and name who it refused · done
- New additive migration `20261128005622_grade_push_line_failure.sql`: nullable `grade_push_lines.failure` (the PushFailure, checked) and `canvas_status` (HTTP status only; no headers or bodies). `sendGrades` writes them on each failed line. Applied locally; **goes to production at CHECKPOINT B (T15)**.
- `lastPushRefused` (`src/lti/grades.ts`, teacher-scoped, tested) reads who Canvas didn't take on the assignment's latest finished push. The banner (`grading/page.tsx`, `push-text.ts`) names them (first 5, then "and N more"); when every refused student is a Student View test student it says Canvas replaced that test student, real students aren't affected, nothing needs fixing, and the banner is the calm blue one instead of the warning.
- Lucy's question: with any "Not graded yet", the banner adds that ungraded students are skipped and each graded student is sent on their own. The preview's Not graded detail says so too.
- Browser (local :3001, ralph.t04, BUS M 499): inserted a mocked finished push with one refused line (422) and set a student's `student_view` for the check: calm banner with the test-student wording at 1280; with `student_view` set back, warning banner naming the student at 390. Mocked push deleted, `student_view` restored to NULL.
- The cause (old Student View user replaced by Canvas) is still the likely one, not confirmed: the next refusal in production will have its status stored. 3ad0e5ab and fdec6a2c stay open per the task. Release note under 2026-11-27.
