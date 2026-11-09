-- The Canvas assignment DALAA made for an activity when the teacher assigns it
-- (D-034, behind ASSIGN_TO_CANVAS). NULL means DALAA made none: the activity is
-- unassigned, or it was linked from Canvas the old way (lti_resource_link_id).
alter table activities
  add column canvas_assignment_id text check (canvas_assignment_id <> '');

-- One activity per Canvas assignment in a course. Partial, so the many NULLs
-- (no assignment) are plainly outside the key rather than relying on NULLs
-- being distinct.
create unique index activities_canvas_assignment_key
  on activities (course_id, canvas_assignment_id) where canvas_assignment_id is not null;
