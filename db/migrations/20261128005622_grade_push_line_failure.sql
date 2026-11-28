-- Why Canvas didn't take a score, kept with the line (feedback 1b203924):
-- production logs last about an hour, so the log line was gone by the time a
-- teacher reported it. Only the reason and Canvas's HTTP status: never
-- headers, tokens or bodies. NULL on sent lines and on failures recorded
-- before this column existed.
alter table grade_push_lines
  add column failure text check (failure in ('rejected', 'forbidden', 'not_found', 'unavailable')),
  add column canvas_status int check (canvas_status between 100 and 599);
