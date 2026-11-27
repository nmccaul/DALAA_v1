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
