# Canvas integration (REST API) and BYU sign-in

*Condensed from DAALAA `dev/2026-09-22-canvas-api-and-sso-plan.md` (Scott,
2026-09-22), which ports the design proven on Quizzer's `daila-v1` branch
(`canvas_api/`, `routes/admin_canvas.py`, `routes/okta.py`,
`.claude/skills/quizzer-canvas/SKILL.md`). Read the original for full detail.*

⚠ **Proven on one BYU practice course (24795) with one student.** Behavior with a
real 50-student roster is unproven. Port the design and the rules, not the Python.

---

## Sign-in — BYU Okta (OIDC, auth code + PKCE)

- Issuer `https://login.byu.edu/oauth2/default`; scopes `openid profile email`;
  NetID = `preferred_username`. CAS only as fallback (BYU is retiring it).
- `users.external_id` = **NetID**. Never Okta's `sub`.
- Session: HMAC-signed `HttpOnly; Secure; SameSite=Lax` cookie.
- State/nonce/PKCE verifier and `intent` (student vs staff) in a short-lived signed
  cookie — never read `intent` from the query string.
- Staff are never created by sign-in; unknown NetID asking for staff is refused.
- Student not on any roster → "ask your instructor to sync the roster."
- Okta needs exact redirect URIs → Vercel preview URLs can't use it; register prod
  + one stable staging URL. Dev uses a stand-in actor.

## Canvas client — one module, the only thing that speaks HTTP to Canvas

- Token passed in by the route (always the signed-in teacher's own); client never
  looks one up. Never log headers, tokens, bodies.
- Timeout on every request (~20 s). `per_page=100`, follow `Link: rel="next"`,
  **raise** past a page cap rather than truncate.
- 403 may mean throttling. Typed errors: not configured, token rejected (→
  "Reconnect Canvas"), forbidden, not found, rate-limited, unavailable, too many pages.
- Decision logic (roster diff, grade eligibility, reconciliation) is **pure** and
  fixture-tested.
- Base URL `https://byu.instructure.com` from env.

## Practice Canvas (D-019)

`src/canvas/practice/` answers the Canvas endpoints DALAA uses, from made-up
data, at `/practice-canvas`. The real client talks to it unchanged; only base
URL and token differ (`practice-*` tokens). It carries BYU's awkward cases:
a cross-listed section, a concluded ("completed") and an inactive student, a
student in two sections, a student with no visible NetID, and a 230-student
course that pages. Used for tests, local work, and demos before (and after)
real tokens are approved. Add a case here whenever real Canvas surprises us.

## Token vault

- Verify against `GET /api/v1/users/self` before storing. AES-256-GCM; key only in
  env. UI shows last 4, added-at, last-verified, Replace. No "show".
- Failed decrypt → "re-enter your Canvas token", never a 500.
- One row per teacher (`canvas_connections`, primary key `user_id`): a new token replaces the old (Quizzer's nullable key let rotated tokens stay live). `mode` is `canvas` (encrypted token required) or `practice` (no token); a CHECK enforces it.
- Built: `src/canvas/vault.ts` (AES-256-GCM, `CANVAS_TOKEN_KEY`), `src/canvas/connection.ts` (the only place a teacher's client is built), `/canvas/connect`. Production and previews share a database, so they share one key.
- **Fallback only if BYU security review requires it:** session-only tokens
  (encrypted cookie, no DB) and a minimal NetID + name roster. Worse for teachers;
  see `conversations/2026-09-30-byu-canvas-engineer.md` → *Fallback options*.
  Keeping all Canvas calls inside the client module keeps this switch cheap.

## Course import + roster

- List courses (`/courses?enrollment_state=active`) and sections; import creates
  course + sections in one step. `canvas_section_id` UNIQUE (cross-listing is real at BYU).
- Roster = merge `/enrollments` (section, state, `login_id`) with
  `/users?include[]=email`; never overwrite a real value with a blank.
- Identity ladder `sis_user_id` → `login_id` → `email`; never name. No `login_id` →
  refuse to create.
- Buckets: add · unchanged · in DALAA not Canvas (**flag, never delete**) ·
  unplaceable (human decides). Match both `concluded` and `completed`.
- A student in two sections: the player asks which, never guesses.

## Assignments and grades

- One Canvas assignment per (activity, course); section windows as overrides.
  `published: true`, `submission_types: ['none']`, link in description.
- Send a date only when there is one (`''` clears it). Record the link only after
  Canvas confirms.
- Grade push: explicit, `POST` `update_grades`, poll the async Progress object;
  unconfirmed ≠ sent. Don't re-post unchanged scores; show lowered grades as their
  own category. "Post no attempt as zero" is a per-push checkbox, never a default.
- Audit ledger of every write, no foreign keys.
- Reconcile three facts (computed · last posted · in Canvas), never merge. "Changed
  in Canvas" is a category. Read `posted_at`, not just `score`.

## Quiz import (later)

Ask BYU first: **Classic or New Quizzes?** Different APIs. MC/TF → MC;
short answer/essay → rubric; everything else listed as skipped with reason.

## Keeping LTI possible

Canvas code stays in the client/auth modules; identity stays NetID (an LTI launch
carries `login_id`); grade rules stay pure so only the sender would change.
Scholarly already has LTI 1.3 code (`scholarly/app/src/lib/lti/`) if/when we go
beyond BYU.

## Estimates (from Scott's plan, solo, unstarted)

Okta 12 h · client + vault 10 h · course import 10 h · roster 16 h · quiz import
14 h+ · assignments 10 h · grade push 14 h · reconcile 8 h → **~94 h**.
