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
