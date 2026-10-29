-- The new-tab fallback for LTI launches (D-020). When the browser blocks the
-- session cookie inside the Canvas iframe, the launch hands the user a
-- one-time code instead; opening it in a first-party tab starts the session
-- there. A code lives about two minutes and is used once (used_at).
create table lti_login_codes (
  code       text primary key check (length(code) >= 32),
  user_id    uuid not null references users(id) on delete cascade,
  -- Where the launch was going; always a path on DALAA's own origin (no
  -- "//host" or "/\host", which browsers read as another site).
  path       text not null check (path = '/' or path ~ '^/[^/\\]'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  check (expires_at > created_at)
);

create index lti_login_codes_expires_idx on lti_login_codes (expires_at);

alter table lti_login_codes enable row level security;
