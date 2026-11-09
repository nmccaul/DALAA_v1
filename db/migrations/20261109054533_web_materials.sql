-- Materials → Add a web page: a saved copy of a page's text, with the address
-- it came from. Additive: old code never writes 'web' or source_url, so this
-- can reach production before the code does.

alter table course_content
  drop constraint course_content_source_check,
  add constraint course_content_source_check
    check (source in ('paste', 'upload', 'canvas-page', 'canvas-file', 'web')),
  add column source_url text,
  -- A web page always has its address; nothing else has one.
  add constraint course_content_web_url check ((source = 'web') = (source_url is not null));

alter table course_guides
  drop constraint course_guides_source_check,
  add constraint course_guides_source_check
    check (source in ('paste', 'upload', 'canvas-page', 'canvas-file', 'web')),
  add column source_url text,
  add constraint course_guides_web_url check ((source = 'web') = (source_url is not null));
