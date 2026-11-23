-- Why the teacher changed the AI's score, for the student to read with their
-- grade (feedback ae234e89). Only with a teacher's score; putting the AI's
-- score back clears it.
alter table results
  add column teacher_note text check (btrim(teacher_note) <> '' and char_length(teacher_note) <= 2000),
  add constraint results_teacher_note_scored check (teacher_note is null or teacher_score is not null);
