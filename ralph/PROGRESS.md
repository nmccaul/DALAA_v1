# Progress

One entry per pass, newest last. Setup (2026-10-29, interactive session): LTI key 10000000000013 + deployment, API key 10000000000014, test course 42, env vars, AI Gateway key. See ralph/PLAN.md.

## 2026-10-29 06:23 UTC · T01 Decisions + docs · done
- Added D-020…D-026 to `docs/DECISIONS.md` (LTI now for gitgrade, Study Chat + modes, Supabase Auth into `admit()`, shared test teacher, self-signup + link by email, email login IDs, AI Gateway). D-020 also records that LTI instructors are admitted per course without the allowlist (T08 needs this). D-008 row notes Study Chat for gitgrade, still open for BYU.
- Updated `docs/ROADMAP.md` (new "Now" section, LTI out of v3), `docs/PRD.md` (non-goals, student flow, stack, tools), `CLAUDE.md` Canvas section (`src/lti/`, login IDs, Supabase rule, AGS), and an amendment note in `docs/CANVAS.md` sign-in rules.
- `.env.example` lists every PLAN env var with empty values (examples in comments).
- Surprise: PGlite tests flaked on vitest's 5 s timeout under load; raised `testTimeout` to 30 s in `vitest.config.mts` (separate commit). No tests skipped.
- Nathan: skim D-020…D-026 wording; `src/auth/admit.ts` comment still says "sign-in never creates a student" — T02/T10 will update the code.

## 2026-10-29 06:25 UTC · T02 Identity accepts email login IDs · done
- `normalizeNetId` (`src/auth/admit.ts`) now accepts a NetID or a plain email (one @, dotted domain, ≤254 chars, local part ≤64), both trimmed and lowercased. Name kept so roster parsing and Canvas import pick up emails without other changes.
- Tests in `src/auth/admit.test.ts`: NetIDs (incl. `practice.`), emails, a list of rejects, and admit() by email login ID case-insensitively.
- Existing `users.external_id` check (non-empty, lowercase) already fits emails; no migration.
- Nathan: roster paste error text still says "isn't a NetID" for bad IDs — fine for BYU, may want "login ID" wording later.

## 2026-10-29 06:27 UTC · T03 Dependencies + iframe cookie · done
- Pinned exactly: `jose@6.2.13` (JWT/JWKS for LTI), `ai@7.0.156` (AI SDK, Gateway model strings), `@supabase/supabase-js@2.118.0` (admin auth client), `zod@4.6.7` (peer dependency of `ai`). All are widely used and maintained.
- `sessionCookieOptions(production)` in `src/auth/session.ts` is the one place cookie attributes live: `Secure; SameSite=None` in production, `Lax` locally. Tested in `session.test.ts`.
- `endSession` now clears the cookie with the same attributes (maxAge 0). A plain delete would be dropped inside the Canvas iframe, so sign-out there would fail silently.
- `docs/CANVAS.md` session line updated. npm audit reports some advisories in transitive deps; not addressed (no --force).

## 2026-10-29 06:29 UTC · T04 LTI tables · done
- Additive migration `db/migrations/20261029062749_lti.sql`: `lti_platforms` (unique issuer+client_id, carries institution_id so T08 knows where to admit), `lti_deployments` (unique per platform), `lti_launch_states` (state PK + unique nonce, both ≥32 chars, expires_at, used_at), `lti_contexts` (PK platform+context, course_id unique so one Canvas course ↔ one course). RLS on all four.
- `src/lti/registration.ts`: `envRegistration()` builds endpoints from `LTI_PLATFORM_URL` and allows issuers `https://canvas.instructure.com` + the platform URL; `LTI_DEPLOYMENT_ID` may be comma-separated. `ensurePlatform()` upserts platform + deployments (null for unknown issuer/client); `isKnownDeployment()` for T07.
- Tests in `src/lti/registration.test.ts` (env parsing, upsert idempotence, refusals, schema uniqueness, RLS). Applied to local DB.
- Surprise: `npm run migrate` doesn't read `.env.local`; ran it with the README's local DATABASE_URL. Not applied to production yet (checkpoint T09 does that).
