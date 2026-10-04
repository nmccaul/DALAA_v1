# Roadmap — v1, v2, v3

*Updated 2026-10-03. Mirrors the GitHub project board (iterations v1 / v2 / v3).
Dates are placeholders. Nothing past v1 is committed: v2 and v3 items get built
when the pilot shows a need, not because they're listed.*

| Version | When (placeholder) | Goal |
|---|---|---|
| **v1** | Oct 2026 → Jan 2027 | One BYU instructor can run a real activity end to end, safely. Baseline function, no vanity features. |
| **v2** | Winter → Summer 2027 | After the pilot: more instructors and tools at BYU, teams, reuse, review workflow, scale. |
| **v3** | Sep 2027 → | Distant future: LTI, other institutions, other LMSs. |

**The v1 test:** if the pilot can run without it, it's not v1. Exceptions are things
BYU's security review or a student's rights require (privacy baseline, extensions).

---

## v1 — BYU pilot

### Phase 1 — foundation, no Canvas API (D-016)

Teacher setup, teacher home pages, and the look and feel — independent of BYU
approvals. Built as small sequential PRs:

1. ✅ **Skeleton** (#13) — Next.js + TypeScript, Postgres migrations, tests, CI.
2. ✅ **Data model + sign-in** — users, staff allowlist, courses, sections,
   memberships, the one scope builder (D-018); dev stand-in login behind the
   sign-in seam (Okta later, #14).
3. ✅ **UI shell + design system** (#15) — Courses · Library · Settings, tokens,
   empty states, one primary action per screen.
4. ✅ **Manual course setup** — create a course, paste/upload a NetID roster
   (D-017), course home (Activities · Students · Results).

All four shipped (Oct 3, 2026), plus the logo, the landing page and hosting at
dalaa-v1.vercel.app.

### Phase 2 — Canvas and the first tool

Done: Canvas client and practice Canvas (D-019), Connect Canvas with an
encrypted token vault, bring in a course, roster sync and connecting a
hand-made course (#17–#19). A visual preview of choosing a tool (no data).

Next, roughly in order:
1. **Onboarding so a colleague can start without us:** add professors in the
   app (#94), getting-started checklist (#95), Canvas token picture guide
   (#96), share with students (#97), help page (#98).
2. **The first tool (#49)**, once Scott chooses Case Chat or Quiz (#4): the
   activity contract (#37), AI layer and cost ledger (#38, #39), authoring
   (#43), student shell (#44), results (#45, #46).
3. **Canvas assignments and grades (#20–#22)**, which need activities.
4. **Real BYU sign-in (#14)** and the BYU IT answers (#9, #10) before any real
   student uses DALAA.

### Everything in v1

| Area | In v1 | Board |
|---|---|---|
| **Sign-in & Canvas** | BYU Okta; Canvas REST with each teacher's token; course + section + roster import; assignment creation (link); explicit grade push + reconciliation; manual resync | #14, #1 → #17–#22 |
| **Roles** | Instructor, student, admin (us) only | — |
| **Module contract** | Minimal: name, config, student screen, prompts, shared results shape. Lifecycle Draft → Published → Open → In progress → Submitted → Completed | #37 |
| **Authoring** | AI draft from source → edit step by step → preview as student → publish; duplicate; required-field check; snapshot of the version each student got | #43 |
| **Course materials** | Upload + text extraction; flag unreadable files; course isolation; hidden materials never sent to students | #40 |
| **Student shell** | Instructions, named progress meter, autosave/resume, AI disclosure, keyboard-usable, desktop first | #44 |
| **AI layer** | AI Gateway, approved model(s), fallback, retries, limits, structured-output validation; versioned prompt files; prompt + model recorded per attempt | #38 |
| **Cost** | Per-call ledger with course/activity/student/model attribution | #39 |
| **Assessment** | Shared results shape with evidence excerpts; instructor override is the final decision; AI never decides misconduct | #45 |
| **Insight** | Class results view (positions, themes, criteria, drill-down); student status + time spent | #46, #47 |
| **Accommodations** | Per-student due-date extension | #48 |
| **Privacy & data** | Encryption, course separation, no-training provider settings, data minimization, written retention/deletion and incident-response procedures | #41 |
| **Backup** | Managed DB backups; CSV export of grades and results | #42 |
| **Tools** | One first tool (Case Chat or Quiz, decision #4) | #49 |

## v2 — after the pilot (BYU)

Parent: #35. Each theme is one issue with a checklist.

| Theme | Includes | Board |
|---|---|---|
| Teams & TeamProof | Canvas group sync, team submissions, membership snapshots, peer evaluation, team grades with individual adjustments | #50 |
| Roles & permissions | TA, course designer, support; section-scoped access; overrides; substitutes; view-as-student; full audit | #51 |
| Authoring & reuse | Import from another course, course copy, archive/restore, draft vs. published versions | #52 |
| AI content builders | Rubrics, objectives, question variants, scenarios, feedback rules, accessibility checker, quality review, convert materials | #53 |
| Material grounding | Linked sources, citations/page refs, versioned source snapshots, AI source allowlist | #54 |
| Student experience | WCAG 2.2 AA audit, mobile polish, hints/retries/timers controls, accommodation overrides | #55 |
| Readiness & pretests | Diagnostic pretests, prerequisites, branching/exemption, pre vs. post | #56 |
| AI & prompt mgmt | BYOK, budgets/alerts/limits, cost estimates, prompt tests, model comparison, rollback, rate limits | #57 |
| Review & disputes | Review-queue states, annotations, retry/evidence requests, disputes, confidence indicators | #58 |
| Monitoring & alerts | Neutral focus/screen-switch events, thresholds, live dashboard | #59 |
| Analytics & research | By objective/question, misconceptions, cross-section, AI vs. instructor, de-identified export | #60 |
| Notifications | Reminders, review/failure alerts, feedback-ready notices | #61 |
| Reliability at scale | Job queues, concurrency, load testing, ops dashboards, DR | #62 |
| Data portability | Full course export, archival reports, restore testing, retention schedules, student record access | #63 |
| Admin & support | Feature flags, troubleshooting, health dashboards, support queue, config history | #64 |
| Canvas OAuth | One-click connect instead of pasted token (trigger: BYU prefers it, or tokens are the setup bottleneck) | #27 |
| Canvas quiz import | After BYU confirms Classic vs. New Quizzes | #28 |
| Convert between tools | Explicit schema mappings (D-009) | #29 |

## v3 — LTI and beyond BYU (distant)

Parent: #65. Only after the pilot proves the product and there's a reason to leave
BYU or embed in Canvas.

| Theme | Includes | Board |
|---|---|---|
| LTI | Launch from Canvas, NRPS rosters/roles, deep linking, AGS grades, group sync | #2, #66 |
| Multi-institution | Per-school Canvas URL, sign-in, settings | #30 |
| Institution admin | Institution settings and approved models, shared keys, allowlists, institution budgets, message templates, fairness testing | #67 |
| Other LMSs | LMS-neutral integration layer; migration between instances | #68 |

v3 depends on choices made in v1: all Canvas calls stay in one module, identity
stays NetID, and grade rules stay separate from the code that sends grades
(`DECISIONS.md` D-004). Scholarly's LTI 1.3 code is the head start.

---

## Explicitly not planned

- Automatic grade posting or automatic roster deletion — ever.
- AI making misconduct determinations — ever.
- Charging for setup (S-003 / D-006).
- One everything-app (S-001 / D-001).
