-- The activity's settings as they were when the attempt started (D-031). A
-- teacher may edit a published activity; an attempt already under way keeps
-- chatting and is graded under the settings it started with. Written by
-- startAttempt (src/attempts/store.ts) for every new attempt. NULL only for
-- attempts started before this column existed: those read the activity's
-- current settings. Left NULL rather than backfilled so the migration stays
-- additive and production can take it before the code ships.
alter table attempts add column settings jsonb check (jsonb_typeof(settings) = 'object');
