-- A teacher's link to Canvas (docs/CANVAS.md "Token vault", D-019).
-- One per teacher: the primary key makes a second connection replace the
-- first, so a rotated token can't leave the old one live (Quizzer's bug).
-- The token is stored only as AES-256-GCM ciphertext; the key lives in the
-- environment, never in the database. Practice connections store no token.
create table canvas_connections (
  user_id          uuid primary key references users(id) on delete cascade,
  mode             text not null check (mode in ('canvas', 'practice')),
  token_ciphertext text,
  token_last4      text,
  canvas_user_id   bigint not null,
  canvas_user_name text not null,
  added_at         timestamptz not null default now(),
  verified_at      timestamptz not null default now(),
  -- a real connection always has a token; a practice one never does
  check ((mode = 'canvas') = (token_ciphertext is not null and token_last4 is not null)),
  check (mode = 'canvas' or (token_ciphertext is null and token_last4 is null))
);

alter table canvas_connections enable row level security;
