# Context — the repos this builds on

*Snapshot 2026-09-30. All live under `~/Desktop/volli/`.*

| Repo | Stack | State | Take from it |
|---|---|---|---|
| **MakeTheCase** | Vite + React, Express, MySQL, Gemini | Most mature: ~165 commits, active through 2026-09-21. Case Chat, Case Writer wizard, class analytics / Present mode with anonymous quotes. | Case Chat UX, Case Writer's step-by-step coaching (the model for all authoring), class analytics. Known defect: teaching note shipped to the browser. |
| **Quizzer** | Flask, MySQL | `main` last touched 2026-07-27 (quizzes, proven 3 semesters). Branch **`daila-v1`: 166 unmerged commits** (Explain, Revise, Canvas, Okta), last 2026-09-08. | `quiz_schema.json`; the whole Canvas/Okta design and lessons (`dev/2026-08-12-Canvas-*`, `docs/2026-08-12_canvas_phase*`, `.claude/skills/quizzer-canvas/SKILL.md`). |
| **DAALAA** | TypeScript, Next.js 15, plain Postgres, Vercel | ~1.3k lines, 7 commits (all 2026-09-01). Schema written but never migrated; no auth, no Canvas. Four types declared (QUIZ, CASECHAT, REVISE, EXPLAIN), none implemented. | Specs in `dev/` (PRD, implementation plan, click paths incl. **first-run**, type picker, Canvas/SSO plan). Hard-won rules in its `CLAUDE.md`. **Its architecture (one platform, six tables, types as plugins) predates the 09-28 suite decision** — reconcile, don't copy blindly. Bug: `or()` in `src/db/scope.ts` widens scope. |
| **Scholarly** | Next.js, Supabase | Nathan's, 66 commits in May 2026. Oral assessment + interactive reading. **Working LTI 1.3 code** (launch, deep link, AGS grade sync, JWKS). | LTI code for later; PRD, HECVAT response, competitor analysis, business-model notes. |

## Naming

The umbrella has been spelled DALLA (meeting), DAALAA (repo), and DAILA (Quizzer
branch). Same idea: *Dynamic AI-Assisted Learning Activities & Assessments*.
**Volli** is the working product name for this repo.

## Meeting notes

- `meetings/2026-09-28.md` — summary of the architecture meeting.
- Full transcript: `~/Desktop/volli/Meeting Notes/2026-09-28 DALLA Meeting Transcript.txt`.
