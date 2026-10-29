-- The AI ledger (D-026): one row per real model call through `src/ai/`,
-- including calls that failed. Tokens and cost are NULL when the provider
-- didn't report them, never 0: an unknown cost is not a free call.
create table ai_calls (
  id            uuid primary key default gen_random_uuid(),
  -- What the call was for, e.g. 'chat.reply', 'grade', 'draft'. Set by the
  -- caller; the chassis doesn't interpret it.
  purpose       text not null check (purpose ~ '^[a-z][a-z0-9_.-]*$'),
  model         text not null check (model <> ''),       -- 'google/gemini-3.8-flash'
  user_id       uuid references users(id) on delete set null,
  course_id     uuid references courses(id) on delete set null,
  ok            boolean not null,
  input_tokens  integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cost_usd      numeric(12, 6) check (cost_usd >= 0),
  -- The AI Gateway's id for the call, to look up cost later when it's NULL.
  generation_id text check (generation_id <> ''),
  created_at    timestamptz not null default now()
);

create index ai_calls_course_idx on ai_calls (course_id, created_at) where course_id is not null;
create index ai_calls_created_idx on ai_calls (created_at);

alter table ai_calls enable row level security;
