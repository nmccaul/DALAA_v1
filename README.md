# DALAA v1

A suite of AI-assisted learning activities that sits beside Canvas — separate,
focused tools (Case Chat, Quiz, Explain, …) on one shared chassis for sign-in,
Canvas, scheduling, grading, and reporting.

## Run it locally

Needs Node 22 (`.nvmrc`). No Docker or Postgres install needed: `npm run
db:local` runs PGlite (Postgres in WebAssembly) as a local server on port
54329, keeping its data in `.pgdata/` (git-ignored).

```bash
npm install
npm run db:local             # terminal 1: local database, leave it running
cp .env.example .env.local   # then set, for local work:
#   DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres?sslmode=disable
#   DATABASE_POOL_MAX=1      # PGlite's server mixes up concurrent connections
#   SESSION_SECRET=<openssl rand -base64 32>
#   CANVAS_TOKEN_KEY=<openssl rand -base64 32>
#   DEV_SIGN_IN=1
npm run migrate                       # apply db/migrations/
npm run staff -- add <netid> --admin  # yourself, so you can sign in
npm run dev                           # http://localhost:3000; /api/health checks the database
```

Sign in with that NetID (no password locally). Courses → Add a course →
"Use practice Canvas" gives you made-up Canvas courses to bring in.

If something looks stuck: PGlite's server occasionally locks up (`/api/health`
says `db: down`): stop and restart `npm run db:local`, data is kept. A page
that 404s for no reason after switching branches is a stale dev cache:
stop `npm run dev`, `rm -rf .next/dev`, start it again.

Checks (CI runs the same): `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`. Tests need no database — they use PGlite (Postgres in-process).

**Deploying:** https://dalaa-v1.vercel.app. Vercel project `dalaa-v1` (personal account) deploys `main` to
production and every PR to a preview. Its database is Supabase, added through
Vercel's Marketplace, which sets `POSTGRES_URL`. Run migrations with
`DATABASE_URL=<POSTGRES_URL_NON_POOLING> npm run migrate` before merging a PR
that adds one. On any other Node server (e.g. a BYU box),
`npm run build`, copy `public/` and `.next/static/` into `.next/standalone/`,
and run `node .next/standalone/server.js` under PM2 (D-007).

## Read first

- `CLAUDE.md` — working conventions and non-negotiable rules
- `docs/PRD.md` — what we're building and why, teacher/student flows
- `docs/DECISIONS.md` — decisions made and still open
- `docs/ROADMAP.md` — v1 scope (Phase 1 first), v2 (after the pilot), v3 (LTI, beyond BYU)
- `docs/CANVAS.md` — Canvas REST API + BYU sign-in design
- `docs/CONTEXT.md` — the older repos this builds on
- `docs/meetings/` — meeting summaries
- `docs/conversations/` — external conversations (BYU Canvas team, etc.)
- `docs/strategy/` — positioning, go-to-market, strategy decisions, marketing assets
