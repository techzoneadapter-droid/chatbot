alter table public.facebook_pages
  add column if not exists comment_hide_mode text not null default 'phone_only';

alter table public.facebook_pages
  drop constraint if exists facebook_pages_comment_hide_mode_check;

update public.facebook_pages
set comment_hide_mode = case comment_hide_mode
  when 'phone' then 'phone_only'
  when 'all' then 'hide_all'
  when 'keywords' then 'blocked_keywords'
  when 'phone_only' then 'phone_only'
  when 'hide_all' then 'hide_all'
  when 'blocked_keywords' then 'blocked_keywords'
  when 'off' then 'off'
  else 'phone_only'
end;

alter table public.facebook_pages
  alter column comment_hide_mode set default 'phone_only';

alter table public.facebook_pages
  add constraint facebook_pages_comment_hide_mode_check
  check (comment_hide_mode in ('off', 'phone_only', 'hide_all', 'blocked_keywords'));
