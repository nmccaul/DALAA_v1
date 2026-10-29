-- Connecting Canvas by OAuth instead of a pasted token (T16a). An OAuth
-- access token lasts an hour; the refresh token gets a new one. Both are
-- sealed by the vault like a pasted token. A pasted token has neither column.
alter table canvas_connections
  add column refresh_ciphertext text,
  add column token_expires_at   timestamptz,
  add constraint canvas_connections_refresh_is_real
    check (refresh_ciphertext is null or (mode = 'canvas' and token_expires_at is not null));

-- OAuth state lives here, not in a cookie (the Canvas iframe drops cookies).
-- It belongs to the teacher who started, expires, and is used once, so a
-- callback can't connect someone else's Canvas to this account.
create table canvas_oauth_states (
  state      text primary key check (length(state) >= 32),
  user_id    uuid not null references users(id) on delete cascade,
  next_path  text not null check (next_path like '/%' and next_path not like '//%'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  check (expires_at > created_at)
);

create index canvas_oauth_states_expires_idx on canvas_oauth_states (expires_at);

alter table canvas_oauth_states enable row level security;
