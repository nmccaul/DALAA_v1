-- A teacher's own score for a graded attempt. The grader's score stays as it
-- was; when the teacher has set one, theirs is the score that counts. NULL:
-- the teacher hasn't changed it (never 0 for "not changed").
alter table results
  add column teacher_score     numeric(8, 2) check (teacher_score >= 0),
  add column teacher_scored_by uuid references users(id),
  add column teacher_scored_at timestamptz;

alter table results
  add constraint results_teacher_score_graded check (teacher_score is null or status = 'graded'),
  add constraint results_teacher_score_max check (teacher_score <= max_score),
  add constraint results_teacher_scored_by check ((teacher_score is null) = (teacher_scored_by is null)),
  add constraint results_teacher_scored_at check ((teacher_score is null) = (teacher_scored_at is null));
