-- Who each DALAA user is to a Canvas's LTI services (D-020). Grades go back
-- through Assignment and Grade Services keyed by the platform's user id (the
-- launch's `sub`, NRPS's `user_id`), which is never an identity in DALAA
-- (CLAUDE.md: identity is the login ID). Recorded at every launch and roster
-- sync; Canvas is the authority, so the latest wins.
create table lti_users (
  platform_id uuid not null references lti_platforms(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  sub         text not null check (sub <> ''),
  updated_at  timestamptz not null default now(),
  primary key (platform_id, user_id),
  unique (platform_id, sub)
);

alter table lti_users enable row level security;

-- Where this Canvas course's gradebook columns are listed and made (AGS
-- lineitems). Canvas sends it on every launch; the latest wins. NULL until a
-- launch carries it.
alter table lti_contexts add column lineitems_url text check (lineitems_url <> '');
