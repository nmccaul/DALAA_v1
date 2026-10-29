-- What an attempt earned, in the one shape every tool writes (CLAUDE.md:
-- results share one shape across tools; src/results/shape.ts checks the JSON).
-- One row per attempt, made when grading starts.
create table results (
  attempt_id  uuid primary key references attempts(id) on delete cascade,
  -- 'grading' while the grader works (or a request that died left it),
  -- 'failed' when it gave up: either may be graded again.
  status      text not null default 'grading' check (status in ('grading', 'graded', 'failed')),
  -- The grader's total and what it was out of. NULL until graded: never 0
  -- for "not graded yet".
  score       numeric(8, 2) check (score >= 0),
  max_score   numeric(8, 2) check (max_score > 0),
  -- Per criterion: label, score, max, evidence (a quote, or NULL), feedback.
  criteria    jsonb check (jsonb_typeof(criteria) = 'array'),
  -- Per point the teacher tracks: label, hit, evidence (a quote, or NULL).
  touchpoints jsonb check (jsonb_typeof(touchpoints) = 'array'),
  -- Which of the activity's positions the student took. NULL when they took
  -- none or the activity has none.
  position    text check (position <> ''),
  feedback    text check (feedback <> ''),
  -- When grading (last) started, so a stuck 'grading' row can be taken over.
  started_at  timestamptz not null default now(),
  graded_at   timestamptz,
  check ((status = 'graded') = (score is not null)),
  check ((status = 'graded') = (max_score is not null)),
  check ((status = 'graded') = (criteria is not null)),
  check ((status = 'graded') = (touchpoints is not null)),
  check ((status = 'graded') = (feedback is not null)),
  check ((status = 'graded') = (graded_at is not null)),
  check (score <= max_score)
);

alter table results enable row level security;
