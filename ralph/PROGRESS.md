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
