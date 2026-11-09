# Progress

One entry per pass, newest last. Run started 2026-11-09: creation wizard,
several materials per activity, reuse across courses, Library removed, Assign
to Canvas. See `ralph/PLAN.md` and `ralph/TASKS.md`. The previous run is in
`ralph/archive/2026-10-29-study-chat-lti/`.

## 2026-11-09 07:15 UTC · T01 Decisions + ideas · done
- Added D-034 to `docs/DECISIONS.md` (wizard order, several materials, Coming-soon shown not hidden, Library removed, Assign behind `ASSIGN_TO_CANVAS`); the open D-013 row now points at it ("still open for BYU").
- `CLAUDE.md` product rule 2 and `docs/PRD.md` goal 2 / next-term reuse now say **Courses · Settings**, reuse in the Activities tab.
- `docs/IDEAS.md`: new section listing the wizard chat panel and each Coming-soon option. `.env.example`: `ASSIGN_TO_CANVAS=`.
- There is no D-033 in DECISIONS; numbered D-034 as the task said. Nathan: renumber if D-033 was meant to exist.
- Local tests: 12 failures, all `Array.fromAsync` on Node 20 — not only the two PDF tests but also helpers in `study-chat/progress.test.ts` (9) and `work.test.ts` (1). Pre-existing; CI (Node 22) is the gate. Treat these as acceptable local failures too.
