-- A teacher adding DALAA as a Canvas assignment (LTI Deep Linking, D-020).
-- Canvas's request is verified at launch and kept here while the teacher picks
-- an assignment; the signed answer goes back to `return_url`. Used once
-- (used_at), and only by the teacher who launched it.
create table lti_deep_link_requests (
  id            uuid primary key default gen_random_uuid(),
  platform_id   uuid not null references lti_platforms(id),
  deployment_id text not null check (deployment_id <> ''),
  course_id     uuid not null references courses(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  return_url    text not null check (return_url ~ '^https?://'),
  -- Canvas's opaque `data`, echoed back unchanged. NULL when it sent none.
  data          text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  used_at       timestamptz,
  check (expires_at > created_at)
);

create index lti_deep_link_requests_expires_idx on lti_deep_link_requests (expires_at);

alter table lti_deep_link_requests enable row level security;
