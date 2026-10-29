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

## 2026-10-29 07:05 UTC · T11 Linking + empty state · done
- Additive migration `20261029070131_users_email_unique.sql`: unique index on `users (institution_id, lower(email)) where email is not null`. No duplicates locally; **production couldn't be checked** (DB still unreachable, T09). If production has duplicate emails, the migration fails in its transaction at the next checkpoint and changes nothing; then merge or clear the duplicates by hand before rerunning.
- `fillEmail` (`src/courses/students.ts`) is now the one way an email is written: fills a gap only, and skips an email another account holds instead of failing the sign-in. `admit()` and the LTI launch's `findOrCreateUser` use it; the launch no longer needs its "two accounts with this email" guard.
- Student home (`src/app/page.tsx`): lists their courses (new `coursesTakenBy` scope + `listTakenCourses`), or "Open DALAA once from your Canvas course" when there are none. Checked in a real browser in light, dark and 390px with a local test student, then removed the test data.
- Tests: index (case-insensitive, NULLs unconstrained), scope, query, and admit's email-fill rules. 167 green.

## 2026-10-29 07:11 UTC · T12 LTI service token + NRPS roster · done
- `src/lti/services.ts`: `serviceToken()` signs a 5-minute client assertion (iss = sub = client id, aud = token URL, jti) with DALAA's key, trades it at the platform token URL (client credentials), caches per platform + scope set until a minute before expiry. Canvas refusing (400/401/403) is `forbidden`; nothing is cached on failure.
- `nrpsMembers(url)` added to `src/canvas/client.ts` (NRPS media type, Link paging, raises past maxPages). Launches now store the NRPS memberships URL on `lti_contexts` (additive migration `20261029070655_lti_context_memberships.sql`, nullable; latest launch wins).
- `src/lti/roster.ts`: `planFromMembers` (Learners only; login_id from the NRPS message custom claim, else email; Inactive/Deleted counted as not enrolled) → `applyPlan` in `src/canvas/sync.ts` (now exported, takes a section-key function). The token is only sent to the token URL's own origin. Students page shows "Sync with Canvas" for LTI courses with two new plain-language errors.
- Roster sync now links by email (D-024): `upsertStudent` takes an optional email, reuses an account holding it, and fills it on new accounts; `applyPlan` tracks membership by account, not login ID.
- Tests: `services.test.ts` (6), `roster.test.ts` (8), launch test for the stored URL. 181 green. Not browser-checked (only a button's form action changed).
- Nathan: DALAA doesn't pass `rlid` to NRPS, so Canvas won't include the `login_id` custom field; members key on email. On gitgrade that's the same thing; on a Canvas where login IDs aren't emails, a roster-created student links on their first launch by email. Migration applied locally only (next checkpoint applies it).

## 2026-10-29 10:03 UTC · T13 AI module · partial (T13a done, T13b blocked)
- Picked up a crashed pass's untracked T13 work (`src/ai/`, migration `20261029071238_ai_calls.sql`) and finished it: `models.ts` (`chatModel()`/`graderModel()` from `CHAT_MODEL`/`GRADER_MODEL` via `gateway()`), `call.ts` (`generateReply`, `streamReply`, `generateStructured`; one `ai_calls` row per real model call through the SDK's per-call callbacks, failed calls included; tokens/cost NULL when unknown; gateway cost + generation id recorded when reported; a ledger write failure is logged, never thrown).
- Fix: on a failed stream the SDK rejects `text` with a generic "No output generated"; `streamReply` now surfaces the provider's real error. 8 tests in `src/ai/call.test.ts` (mock models); 189 total green.
- Migration additive (create table + indexes, RLS); applied locally only. Local `npm run migrate` needs `DATABASE_URL` set explicitly (it isn't read from `.env.local`).
- `scripts/ai-smoke.mts` makes one real call per model. It failed: **AI Gateway requires a credit card on file** (`customer_verification_required`). The failed call was recorded as `ok=false`, NULL tokens/cost, which confirms the ledger path.
- **Nathan:** add a card to the Vercel team's AI Gateway, then run `npx tsx --env-file=.env.local scripts/ai-smoke.mts` and mark T13b done. Production will need the same card (and OIDC) before T17/T21/T22 can do real calls; their mocked parts can proceed.

## 2026-10-29 09:07 UTC · T14a Study Chat schema + modes + activities table · done
- Split T14: T14a (schema, modes, table) done; T14b (catalog → registry, Study Chat live, Quizzer/Oral Assessment "Coming soon", pages that read `TOOLS`) added to TASKS.
- `src/tools/study-chat/schema.ts`: strict zod object (unknown keys refused): mode, goal, `scenarios` (exactly one in v1), positions, touchpoints, persona (name, role, background, tone, helpfulness), completion (maxTurns / timeLimitMinutes / question all NULL for "not used", studentCanFinish; refuses a chat with no way to end), rubric (criteria with points, strictness strict/balanced/lenient). Every field carries a `title` (teacher label, for T19's search) and `description` (for T17's drafting model). `rubricPoints()` sums criteria.
- `src/tools/study-chat/modes.ts`: the 10 modes (Explain, Apply, Liken to me, Case Chat, Debate, Pitch, Interview, Roleplay, Liken to us, Socratic), each with label, one-line description, prompt seed and persona/completion/rubric hints. Written fresh, MakeTheCase used for ideas only.
- Additive migration `20261029090502_activities.sql` (RLS): settings must be a JSON object, a published activity must have points > 0, unique (course, resource link id) with NULLs unconstrained. Applied locally only. Content is not in settings; T15 adds it to the activity.
- Tests: `src/tools/study-chat/schema.test.ts` (11) + an activities constraint test in `src/db/schema.test.ts`. 201 green.
- Nathan: `activities.points` isn't forced to equal the rubric total; decide in T19 whether points come from the rubric or are set separately.

## 2026-10-29 09:09 UTC · T14b Tool registry · done
- `src/tools/catalog.ts` is now the registry: each tool has a `status` (`live` / `coming-soon`) and `isLive()`. Study Chat (`study-chat`) is live; Quizzer (`quizzer`) and Oral Assessment (`oral-assessment`, new Microphone icon, kept the old pink accent) are coming soon. The old Case Chat and Explain entries are gone: they're Study Chat modes now (D-021).
- New activity page: Study Chat is the only clickable card ("Start a Study Chat →"); the others are muted cards marked "Coming soon". The general "tools aren't built yet" preview note is removed. The per-tool page 404s for a coming-soon tool and dropped its "Or look at…" links; for Study Chat it's still the walkthrough with a disabled Start button until T19 builds the create flow.
- Landing page: the tools list now comes from the same registry and marks Quizzer and Oral Assessment "Coming soon". The hero copy ("Case discussions, quizzes and explain-it-back activities…") is unchanged.
- Tests: `src/tools/catalog.test.ts` (unique slugs, statuses, white-on-accent contrast ≥ 4.5:1). 205 green. Checked the landing and both teacher pages render (200; quizzer page 404) against the local dev server with a signed local session; no screenshot pass.
- Nathan: check the new Study Chat and Oral Assessment one-liners on the landing page; they describe what's being built, not what's live in production yet.

## 2026-10-29 09:12 UTC · T15 Content intake · done
- Additive migration `20261029090958_course_content.sql` (RLS): `course_content` (course, source paste/upload/canvas-page/canvas-file, name, body, unique client `creation_key`), plus nullable `activities.content_id` with a composite FK so an activity can only use content from its own course. Content belongs to the course, not one activity, so the create flow (T19) can take it in before the activity exists. Applied locally only.
- `src/content/read.ts` (pure): paste, .txt, .md (UTF-8, by extension), .pdf (text via **unpdf 1.9.1**, pinned; unjs-maintained pdf.js wrapper that runs serverless. I skipped 2.0.0 because it was published the day before). Limits: 4 MB upload (under Vercel's 4.5 MB body limit) and 100,000 characters. Every refusal is a plain sentence (wrong type, too big, not text, damaged PDF, scanned PDF with no text). `src/content/store.ts`: `saveContent` for the course's teachers only, idempotent on the key.
- Tests: `read.test.ts` (11, builds a small PDF in the test) and `store.test.ts` (5). 221 green.
- Surprise: this shell's default `node` is 20, but `.nvmrc` says 22, and pdf.js needs Node 22's `Iterator` global. Under Node 20 the PDF tests fail. I ran everything on nvm's 22.23.3. Vercel runs 24, so production is fine. **Nathan:** make 22 your default (`nvm alias default 22`), or have `ralph/run.sh` put 22 on PATH.
- No UI yet: T19's create flow calls `saveContent`. Not run through `next build` because nothing imports unpdf from the app yet; T19 should check the build.

## 2026-10-29 09:18 UTC · T16a Canvas OAuth connect · done
- `CANVAS_OAUTH_CLIENT_SECRET` is set (checked by length only), so T16 isn't blocked. Split it: T16a OAuth connect (done), T16b pages/files client, T16c content picker.
- `src/canvas/oauth.ts`: authorize URL, code exchange and refresh against `CANVAS_BASE_URL/login/oauth2/*` (400/401 → token-rejected). `src/canvas/connection.ts`: `beginOAuth` / `finishOAuth` (state in new `canvas_oauth_states`, one use, 10 min, only for the teacher who started it, so nobody can connect their Canvas into someone else's account), tokens sealed by the vault; `clientFor` refreshes an OAuth token within 5 minutes of expiry, and if Canvas refuses it uses the stored token so the next call surfaces as "reconnect". `connectReturnPath` replaces the two copies of the ?next= check.
- Additive migration `20261029091424_canvas_oauth.sql`: nullable `refresh_ciphertext` + `token_expires_at` on `canvas_connections` (a check: refresh token only on a real connection, with an expiry) and the states table (RLS). Applied locally only.
- Routes `/api/canvas/oauth/start` and `/callback`. The connect page shows "Connect with Canvas" as the main action when OAuth is set up, with the paste-a-token steps folded under it. It's a plain `<a>`, not `<Link>`, so prefetching can't create states. Tests: `oauth.test.ts` (4) + 8 OAuth cases in `connection.test.ts`; 233 green. Diff ~600 lines, about a third of it tests.
- Not done: a real round trip with gitgrade (it needs a browser signed into Canvas), and no browser check of the connect page. DALAA doesn't send `scope`, so if the "DALAA API" key has scopes enforced, Canvas will refuse until it lists the pages/files scopes. Disconnect doesn't revoke the token in Canvas yet.
- **Nathan:** VERIFY IN MORNING: Settings → Connect Canvas → "Connect with Canvas" on localhost against gitgrade. Canvas's approve page probably won't load inside the Canvas iframe, so T16c should open it in a new tab.

## 2026-10-29 09:22 UTC · T16b Canvas pages/files client · done
- `src/canvas/client.ts`: `pages` (all pages, published or not — teachers often hide a case until class), `page` (with HTML body), `files`, `file`, and `download(url, maxBytes)`, which only fetches URLs on the same Canvas origin, streams with a byte cap (new error kind `too-large`), and relies on fetch dropping the token on a cross-host redirect to file storage.
- `src/canvas/content.ts`: `listCanvasContent` (pages + only .pdf/.txt/.md files, filtered by name because Canvas types .md inconsistently), `fetchCanvasPage` / `fetchCanvasFile` → a `ContentInput` for `saveContent`, or a plain refusal with `reconnect` set when the token is refused. Size is checked from Canvas's metadata before downloading.
- `src/content/read.ts`: new inputs `canvas-page` (HTML → text) and `canvas-file`, saved with sources `canvas-page` / `canvas-file` (already allowed by the T15 check). HTML → text via **html-to-text 10.0.1** (pinned; the long-standing, widely used converter; 10.0.1 fixes a deepmerge advisory in 9.x). It ships no types, so `@types/html-to-text` 9.0.4 is used; 10's changelog says the API is unchanged.
- Practice Canvas now has pages and files for course 1101 (a made-up "Case: Harbor Bikes" page, a .md, a .txt and a .docx that's filtered out) with verifier download links. Tests: `src/canvas/content.test.ts` (10) + 2 in `read.test.ts`; 245 green.
- Not tried against real gitgrade (needs the OAuth connect from T16a in a browser). **Nathan:** if the "DALAA API" developer key enforces scopes, it needs the pages, files and file-download scopes.
