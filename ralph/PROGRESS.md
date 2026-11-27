# Progress

One entry per pass, newest last (PROMPT.md §3). Plan: `ralph/PLAN.md`.

## 2026-11-27 19:55 UTC · T01 Grade panel: each student's own score, and Feedback reachable · done
- Cause: Next/Previous re-renders the same server-rendered panel, so React reused the uncontrolled score input (`defaultValue`) and NoteField's `useState`. Fix: `key={attempt.id}` on `ScoreForm`/`DisputeForm` in `grading/grade-panel.tsx` (dispute answer box is inside the keyed form too). No action state to reset: the forms use plain server actions.
- Feedback tab (`src/components/feedback.tsx`) raised from z-30 to z-[60], above the panel (z-50) and its backdrop (z-40). The dialog itself is a modal `<dialog>` (top layer), so it already opened above everything.
- Browser check (local, course 1ce67d02, ralph.t04): typed 2 + a note on Hyrum (stored 5), Next → Ivy shows her own 9.5 and an empty note; Previous → Hyrum back to 5. Feedback tab hit-tests as topmost with the panel open at 1280 and 390 and opens its dialog. Nothing saved, local data unchanged.
- No unit test: the repo has no DOM test library and the fix is React reconciliation; verified in the browser instead.
- Release note under 2026-11-27.
