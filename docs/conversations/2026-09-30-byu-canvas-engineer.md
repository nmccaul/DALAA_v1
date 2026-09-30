# BYU Canvas engineer — conversation log

*Opened 2026-09-30 via BYU IT support. Contact: _name / email_ ·
Team: canvas_team@byu.edu · Ticket: _#_*

Fill in **Answer** under each question during or after the call, then copy any
resulting decisions into `../DECISIONS.md`.

---

## What we're asking for, in one breath

> We're building a tool for a small pilot of 3–4 BYU instructors (Winter 2027)
> with Dr. Scott Sampson. Each instructor pastes their own Canvas personal access
> token; the tool uses the REST API to import their courses, sections, and rosters,
> create an assignment that links to the activity, and post grades back. Students
> open the link from Canvas and sign in with BYU. Dr. Sampson's token already
> works against the live API (tested on a practice course). We want to scale that
> to a few more instructors, the right way.

## What we already know

- **Dr. Sampson's personal token works** — verified against the live BYU Canvas
  API; roster sync and grade posting exercised on practice course 24795 (one
  student). Source: Quizzer `daila-v1` branch, `docs/2026-08-12_canvas_phase1.md`.
- **BYU's LTI page** (byucanvas.byu.edu/lti-applications-in-canvas): simple LTIs
  install per course without review; LTI 1.3, detailed user data, or multi-course
  apps need advanced configuration and "will likely also require security and
  privacy review." Silent on personal tokens, developer keys, FERPA, and timelines.

## Data we would hold (be upfront about this)

| Data | Source | Can we minimize? |
|---|---|---|
| Student names, NetIDs, Canvas user IDs, section enrollments | Canvas roster API | NetID is the identity key; **drop email** unless needed |
| Grades | Computed by Volli, posted to Canvas | No — core function |
| Student work: AI chat transcripts, quiz answers, AI feedback | Created in Volli | No — this *is* the product |
| Student work sent to an AI provider (Gemini / Anthropic) | Outbound per turn | Ask what BYU has approved |
| Instructors' Canvas tokens (full Canvas access *as that instructor*) | Pasted by instructor | Encrypted at rest (AES-256-GCM, key separate from DB), never displayed or logged; only imported courses are touched |

Hosting (proposed): Vercel + hosted Postgres. Portable to BYU infrastructure by
connection string.

### Fallback options — only if security review requires less data

**Not the plan.** Each of these makes the product worse for teachers; offer them
only if BYU won't approve the table above.

| Option | What we'd stop storing | Cost to teachers |
|---|---|---|
| **Session-only tokens** — token kept in an encrypted HttpOnly cookie, never in our database | Instructors' Canvas tokens (lets us say "we never store Canvas credentials") | Re-paste the token on a new browser/device or when the cookie expires |
| **Minimal roster** — keep only NetID + name; post grades using `sis_login_id:<NetID>`; fetch sections live | Emails, Canvas user IDs, stored section enrollments | "Who hasn't started" and "post zero for no attempt" need a live Canvas lookup, so they only work while the teacher is signed in |
| **Retention limit on student work** — delete transcripts/answers N days after term end; AI provider set to no retention / no training | Long-term student work | Past terms' results aren't available for reuse or research |
| **Pseudonymized work** — work stored under an internal id, NetID mapping in a separate table | Direct NetID ↔ transcript link in one table | None visible; some engineering cost |
| **Encourage token expiry** — Connect Canvas screen suggests setting the token to expire at term end | Long-lived tokens | Reconnect once per term |

Grades don't need their own fallback: they're recomputable from student work;
we only keep a log of what we posted.

**If a fallback comes up, ask:** can a regular instructor's token use
`sis_login_id:` ids at BYU, or does that need a "read SIS data" permission? Is a
server-encrypted token in a cookie acceptable?

---

## Questions

### A. Personal access tokens (most important)

**A1.** Is it acceptable for instructors to use their own personal access tokens
with our tool, for a pilot of 3–4 instructors?
- Answer:

**A2.** Can all instructors generate tokens, or is that restricted? Do tokens
have a forced expiry?
- Answer:

**A3.** Any API rate limits or usage policies we should design for?
- Answer:

**A4.** Would you rather we use a **developer key (OAuth2)** or an **LTI 1.3**
app instead? Is either faster or easier to approve than personal tokens?
- Answer:

**A5.** If LTI 1.3: can it be enabled across several instructors' courses, and
who installs it?
- Answer:

### B. Security, privacy, FERPA

**B1.** Given the data above, do we need the security & privacy review even on
the personal-token route? What documentation (HECVAT?) and what timeline?
- Answer:

**B2.** Can student records (names, NetIDs, grades, transcripts) live on
**Vercel + hosted Postgres**, or must they be on BYU infrastructure?
- Answer:

**B3.** Does sending student work to an AI provider need separate approval? Does
BYU have an approved provider or agreement (e.g., Gemini via Google Workspace,
Azure OpenAI, Anthropic)?
- Answer:

### C. Sign-in

**C1.** Can we register as a **BYU Okta OIDC client** for students and staff?
Which redirect URIs can we register (a Vercel domain + one fixed staging URL)?
Or is CAS still appropriate short-term?
- Answer:

### D. Canvas facts

**D1.** Is a student's Canvas `login_id` always their NetID?
- Answer:

**D2.** Are instructors on **Classic Quizzes or New Quizzes**? Is New Quizzes
being enforced, and when?
- Answer:

**D3.** Anything about cross-listed courses/sections at BYU we should know?
- Answer:

---

## Before hanging up

- [ ] Engineer's name and email
- [ ] Ticket number
- [ ] Who owns: Canvas admin · security/privacy review · Okta registration
- [ ] Expected timeline for each
- [ ] Next step and who takes it

## Outcome / follow-ups

- _Decisions to record in `../DECISIONS.md` (D-004 stays or changes?)_
-
