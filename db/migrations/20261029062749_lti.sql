-- LTI 1.3 (D-020). Written from the spec, not copied from Scholarly.

-- A Canvas that launches DALAA. Registration comes from the environment and is
-- upserted on first use (src/lti/registration.ts). Keyed by (issuer, client_id)
-- because one Canvas may sign as https://canvas.instructure.com while its
-- endpoints live on its own host.
create table lti_platforms (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  issuer         text not null check (issuer <> ''),
  client_id      text not null check (client_id <> ''),
  auth_url       text not null check (auth_url <> ''),
  token_url      text not null check (token_url <> ''),
  jwks_url       text not null check (jwks_url <> ''),
  created_at     timestamptz not null default now(),
  unique (issuer, client_id)
);

-- An install of the tool in that Canvas. A launch naming any other deployment
-- is refused.
create table lti_deployments (
  id            uuid primary key default gen_random_uuid(),
  platform_id   uuid not null references lti_platforms(id) on delete cascade,
  deployment_id text not null check (deployment_id <> ''),
  created_at    timestamptz not null default now(),
  unique (platform_id, deployment_id)
);

-- OIDC state and nonce live here, not in cookies (the Canvas iframe drops
-- them). Each row expires and is used once: used_at is set by the launch that
-- consumes it, and a second launch with the same state or nonce is refused.
create table lti_launch_states (
  state       text primary key check (length(state) >= 32),
  nonce       text not null unique check (length(nonce) >= 32),
  platform_id uuid not null references lti_platforms(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  check (expires_at > created_at)
);

create index lti_launch_states_expires_idx on lti_launch_states (expires_at);

-- A Canvas course (LTI context) mapped to a DALAA course. One context maps to
-- one course and one course to at most one context, so a relaunch finds the
-- same course instead of making a second.
create table lti_contexts (
  platform_id uuid not null references lti_platforms(id) on delete cascade,
  context_id  text not null check (context_id <> ''),
  course_id   uuid not null unique references courses(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (platform_id, context_id)
);

alter table lti_platforms     enable row level security;
alter table lti_deployments   enable row level security;
alter table lti_launch_states enable row level security;
alter table lti_contexts      enable row level security;
