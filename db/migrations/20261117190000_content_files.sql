-- The file a reading was made from, so students see it as it was made (pages,
-- layout, pictures) and not only its text. PDFs only, for now; uploaded or
-- picked from Canvas after this migration. The text in course_content stays
-- what the AI reads and what a screen reader or phone falls back to.
create table content_files (
  content_id uuid primary key references course_content(id) on delete cascade,
  media_type text not null check (media_type = 'application/pdf'),
  -- The same 4 MB cap as an upload (src/content/read.ts MAX_UPLOAD_BYTES).
  bytes      bytea not null check (octet_length(bytes) between 1 and 4194304),
  created_at timestamptz not null default now()
);

alter table content_files enable row level security;
