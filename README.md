# DALAA v1

A suite of AI-assisted learning activities that sits beside Canvas — separate,
focused tools (Case Chat, Quiz, Explain, …) on one shared chassis for sign-in,
Canvas, scheduling, grading, and reporting.

## Run it

Needs Node 22 (`.nvmrc`) and a Postgres database — a Supabase project's
"Transaction pooler" connection string works, as does any Postgres.

```bash
npm install
cp .env.example .env.local   # set DATABASE_URL
npm run migrate              # apply db/migrations/
npm run dev                  # http://localhost:3000 — /api/health checks the database
```

Checks (CI runs the same): `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`. Tests need no database — they use PGlite (Postgres in-process).

**Deploying:** Vercel works as is. On any other Node server (e.g. a BYU box),
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
