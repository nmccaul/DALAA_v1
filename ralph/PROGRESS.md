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

## 2026-10-29 06:40 UTC · T05 Tool keys + JWKS + config · done
- `src/lti/keys.ts`: `loadToolKey()` reads `LTI_PRIVATE_KEY` (base64 PKCS8 PEM), refuses non-RSA or unreadable keys with `LtiKeyError` (never echoing the value), derives the public JWK (kty/n/e + alg RS256, use sig) with `kid` = RFC 7638 thumbprint, so it's stable across deploys. `toolKey()` caches per process; T07/T12/T20 sign with `privateKey`.
- `src/lti/config.ts` builds the Canvas JSON config (login/launch/JWKS URLs, 5 AGS+NRPS scopes, the 3 custom fields, public privacy, course_navigation + assignment_selection "DALAA Study Chat").
- Routes `/api/lti/jwks` (503 "LTI is not configured" without a key; 1 h cache header) and `/api/lti/config` (base = `APP_URL`, else request origin).
- Tests: `src/lti/keys.test.ts`, `src/lti/config.test.ts`. Local curl: one RSA key, fields alg,e,kid,kty,n,use, no `d`.

## 2026-10-29 06:42 UTC · T06 OIDC login initiation · done
- `src/lti/login.ts`: `readLoginParams()` (GET query or POST form) and `beginLogin()`: requires iss/login_hint/target_link_uri, checks iss + client_id through `ensurePlatform` (client_id may be absent, then the registration's), stores a 32-byte state + nonce in `lti_launch_states` for 10 min, prunes rows expired over a day, and redirects to the platform's authorize URL (openid, id_token, form_post, prompt=none, redirect_uri, login_hint, state, nonce, lti_message_hint passed through).
- Route `src/app/api/lti/login/route.ts` (GET and POST). 400 missing params, 403 unknown issuer/client, 503 when LTI env is missing.
- `src/lti/config.ts` now has `ltiUrls()` and `appUrl(request)` so the login, launch and config routes read one place for endpoint paths.
- Tests: `src/lti/login.test.ts` (good request, both issuers, missing client_id, unknown issuer, unknown client, missing params, unconfigured, GET/POST parsing).
- redirect_uri is always DALAA's own launch URL (from APP_URL), never the request's target_link_uri; the launch (T07) checks target_link_uri in the token.

## 2026-10-29 06:45 UTC · T07 Launch validation · done
- `src/lti/validate.ts`: `validateLaunch()` consumes the state atomically first (one `update … where used_at is null and expires_at > now`), so a replay or a race fails and a bad token still burns its state. Then jose `jwtVerify` (RS256 only, 60 s clock tolerance, exp/iat/nonce/sub required) against the platform JWKS, iss = the issuer the login named, aud contains our client id, azp required and equal when there are several audiences or azp is present, nonce = the stored one, deployment known, version 1.3.0, Resource Link (needs resource_link.id) or Deep Linking (needs deep_link_return_url), target_link_uri present.
- Returns typed `LaunchClaims` (platform, sub, email, name, roles, context, resource link, custom fields as strings, deep linking settings, AGS and NRPS endpoints) for T08. Remote JWKS sets are cached per URL (`remoteKeys`); tests inject a local set.
- Route `src/app/api/lti/launch/route.ts` (POST): for now a verified launch only returns `{ ok, messageType }`; T08 replaces this with sign-in.
- Tests `src/lti/validate.test.ts` (14): good, deep linking, bad signature, wrong aud, multi-aud/azp, wrong iss, replayed state, nonce from another login, burned state, unknown deployment, expired token, expired state, bad version/type/missing claims, form parsing.
- Not checked: target_link_uri against our own origin (left to T08, which decides where to redirect).

## 2026-10-29 06:48 UTC · T08a Launch → session · done
- Split T08: T08a (sign-in from a launch) done; T08b (new-tab fallback with one-time code, plain error page) added to TASKS.
- `src/lti/launch.ts`: `signInFromLaunch()` — login ID from `login_id` custom field, else email; links to an existing user by email (only when exactly one matches; their login ID and real name are kept); course found via `lti_contexts` or, on an instructor's first launch, created with a creation key derived from (platform, context) so two simultaneous first launches make one course; membership role follows the Canvas course role (institution roles ignored). A student arriving before any instructor launch is refused before anything is written.
- `/api/lti/launch` now starts the session and 303-redirects to `/courses/<id>` (instructor) or `/` (student), always on DALAA's own origin (target_link_uri is not used for redirects).
- `loadActor` (`src/auth/admit.ts`): `isStaff` is also true for an active instructor of an LTI-linked course (D-020); admin still only from the allowlist. Side effect: such a teacher can also set up other courses — Nathan, say if that's too broad.
- Course term: Canvas doesn't send it, so LTI courses show "From Canvas" unless a `canvas_term` custom field is added (`$Canvas.term.name`) to the developer key. A Canvas course id already held by another DALAA course is stored as NULL rather than failing.
- Tests: `src/lti/launch.test.ts` (10) run the real route with a signed fake launch (mocked db client, cookie jar, JWKS).

## 2026-10-29 06:51 UTC · T08b New-tab fallback · done
- Every verified launch now sets the cookie, makes a one-time login code (additive migration `20261029064935_lti_login_codes.sql`, RLS, 2 min, used once, path must be on DALAA's origin — a check constraint refuses `//host` and `/\host`) and 303s to `/api/lti/landed?code=`. If the session cookie came back for that user, the code is spent and the browser goes on to the course; otherwise it shows "Open DALAA in a new tab" (`target=_blank`) → `/api/lti/open` spends the code, starts the session first-party and lands on the same page.
- `src/lti/handoff.ts` (create/pending/redeem/land), `src/lti/page.ts` (plain HTML page, escaped, system colors only so light/dark work), routes `src/app/api/lti/{landed,open}/route.ts`; `sessionUserId()` added to `src/auth/current.ts`.
- Launch errors are now a plain HTML page with the same status codes (no more JSON inside Canvas).
- Tests: `src/lti/handoff.test.ts` (use-once, expiry, path constraint, cookie present/blocked/other user, landed→open redirect, HTML escaping); `launch.test.ts` updated for the landed hop. Migration applied locally only; T09 applies it to production.
- Nathan: the new-tab page is plain HTML (not the app shell), deliberately, since it answers a cross-site POST; check its look in Safari inside Canvas tomorrow.

## 2026-10-29 06:54 UTC · T09 CHECKPOINT A (deploy) · blocked
- Lint, typecheck and tests green (148 tests); branch pushed. Both new migrations (`20261029062749_lti.sql`, `20261029064935_lti_login_codes.sql`) are additive (create table/index, enable RLS).
- Applying them to production failed: the Supabase pooler answers `tenant/user postgres.rxcytik… not found`. Production `/api/health` was **already** `{"ok":false,"db":"down"}` before this pass, so it isn't something this branch caused. The project isn't in the Supabase account the MCP tool can see (likely Vercel Marketplace-managed), so I couldn't check whether it's paused.
- Stopped before the PR/merge/deploy: nothing merged, production unchanged (`/` 200, `/api/lti/jwks` 404 because main doesn't have it yet).
- Production env has the LTI_* var names; they're sensitive, so their values can't be pulled to confirm they're non-empty.
- **Nathan:** open the DALAA Supabase project (via Vercel → Storage), restore/unpause it (or fix POSTGRES_URL_NON_POOLING if the project moved), confirm `/api/health` shows the db up, then rerun T09 (set it back to `[ ]`).

## 2026-10-29 06:59 UTC · T10 Supabase sign-in + signup · done
- `src/auth/password.ts`: the rules. `signInWithPassword` / `createAccount` take a `PasswordProvider` (Supabase in the app, a fake in tests). Only exact `SCHOOL_EMAIL_DOMAINS` domains (`a@mail.byu.edu` is refused), 8-character minimum, an email matching an existing account signs in to it (D-024). `src/auth/supabase.ts` is the server-only service-role client (`signInWithPassword`, `admin.createUser` with `email_confirm: true`). Supabase outages throw instead of showing "wrong password".
- `admit()` takes `{ newStudent }`: a Supabase-proven school email with no roster entry gets a student account with no courses (T11 adds their empty state). It also fills a missing email for rostered students. Without the flag, nothing changes: dev and LTI sign-in still never create a student this way.
- Shared test teacher (D-023): checked in DALAA, not in Supabase, with a constant-time compare. It's staff in both `admit` and `loadActor` only while `TEST_TEACHER_EMAIL` and `TEST_TEACHER_PASSWORD` are set, so unsetting them removes staff at once with no allowlist row to clean up. `dev.ts` now uses the same `secretsMatch`.
- Sign-in page: email + password first, "New student? Create an account" (`?mode=create`), and the NetID dev sign-in folded under a small "Test sign-in with a NetID" (still behind `DEV_SIGN_IN`). Checked in a real browser at desktop and 390px (wrong password → "That email and password don't match."). I didn't do a real test-teacher login in the browser because the browser tool echoes typed values, and I didn't try Supabase signup against the live project.
- Tests: `src/auth/password.test.ts` (15). Total 163 green.
- **Nathan:** there's no rate limit on password attempts yet (Supabase rate-limits its own sign-in, but the test-teacher check doesn't). Fine for testing; add one before the pilot.
