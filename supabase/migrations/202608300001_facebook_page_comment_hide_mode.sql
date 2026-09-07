alter table public.facebook_pages
  add column if not exists comment_hide_mode text not null default 'phone';

alter table public.facebook_pages
  drop constraint if exists facebook_pages_comment_hide_mode_check;

alter table public.facebook_pages
  add constraint facebook_pages_comment_hide_mode_check
  check (comment_hide_mode in ('off', 'phone', 'all'));

update public.facebook_pages
set comment_hide_mode = case
  when auto_hide_comments = false then 'off'
  when hide_phone_comments = true then 'phone'
  else 'off'
end
where comment_hide_mode is null;
