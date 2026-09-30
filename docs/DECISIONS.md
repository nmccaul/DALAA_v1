# Decisions

*Append new decisions; don't rewrite old ones — supersede them with a new entry.*

---

## Made

### D-001 · Volli is a suite (Office), not an everything-app (Symphony)
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

### D-009 · Converting activities between tools is a should-have, not v1
*2026-09-28 meeting (Lucy raised; Nathan scoped).* Make a ticket; revisit after
the chassis ships.

### D-010 · Invite outside tool builders (Adam Jensen) once the contract exists
*2026-09-28 meeting.* Scott to invite. Needs the tool-builder contract (PRD §9)
written first.

---

## Open

| # | Question | Owner | Notes |
|---|---|---|---|
| D-007 | Stack: adopt DAALAA's TypeScript + Next.js + plain Postgres + Vercel? | Nathan / Scott | Recommended. Old repos are Flask+MySQL (Quizzer) and Vite+Express+MySQL (MakeTheCase). |
| D-008 | First tool on the chassis: Case Chat or Quiz? | Scott | Case Chat is most proven/active; Quiz runs with AI down (simplest chassis test). |
| D-011 | How does DAALAA relate to volli_v1? Replace, or port its code? | Scott / Nathan | DAALAA's `CLAUDE.md` still says "six tables, a type never adds a table" — reconcile with D-003 before any agent runs there. |
| D-012 | Does Explain move under Case Chat? | Scott | Scott's view in the meeting: yes. |
| D-013 | Canvas assignment creation opt-in per activity, or on by default? | Nathan | DAALAA plan says opt-in; simplicity argues for default-on with an off switch. |
| D-014 | Which attempt is authoritative for a grade push (latest accepted?) | Scott | REVISE complicates "latest". |
| — | BYU IT: personal tokens OK at multi-instructor scale? Records on Vercel? FERPA? Okta registration? | Scott | Longest lead time — send now. |
| — | Classic or New Quizzes at BYU? | Scott | Two different APIs for quiz import. |
