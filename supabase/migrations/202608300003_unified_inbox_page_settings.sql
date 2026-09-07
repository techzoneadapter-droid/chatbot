alter table public.customers add column if not exists page_id text;

alter table public.conversations add column if not exists customer_psid text;
alter table public.conversations add column if not exists customer_name text;
alter table public.conversations add column if not exists last_message text;
alter table public.conversations add column if not exists last_message_at timestamptz;
alter table public.conversations add column if not exists unread_count integer not null default 0;
alter table public.conversations add column if not exists human_takeover boolean not null default false;

update public.conversations
set customer_psid = external_user_id
where customer_psid is null;

alter table public.messages add column if not exists page_id text;
alter table public.messages add column if not exists customer_psid text;
alter table public.messages add column if not exists facebook_message_id text;
alter table public.messages add column if not exists direction text;
alter table public.messages add column if not exists text text;
alter table public.messages add column if not exists ai_generated boolean not null default false;
alter table public.messages add column if not exists status text not null default 'received';

update public.messages
set text = message
where text is null;

alter table public.facebook_pages add column if not exists ai_reply_delay_seconds integer not null default 3;
alter table public.facebook_pages add column if not exists ai_business_name text;
alter table public.facebook_pages add column if not exists ai_system_prompt text;
alter table public.facebook_pages add column if not exists ai_tone text;
alter table public.facebook_pages add column if not exists ai_sales_goal text;
alter table public.facebook_pages add column if not exists ai_product_context text;
alter table public.facebook_pages add column if not exists ai_faq_context text;
alter table public.facebook_pages add column if not exists ai_allowed_topics text;
alter table public.facebook_pages add column if not exists ai_fallback_message text;
alter table public.facebook_pages add column if not exists blocked_keywords text[] not null default '{}';

alter table public.leads add column if not exists page_id text;
alter table public.leads add column if not exists customer_psid text;

alter table public.conversations
  drop constraint if exists conversations_platform_external_user_id_key;

alter table public.customers
  drop constraint if exists customers_platform_external_user_id_key;

create unique index if not exists idx_conversations_platform_page_customer
  on public.conversations(platform, coalesce(page_id, ''), external_user_id);

create unique index if not exists idx_customers_platform_page_external
  on public.customers(platform, coalesce(page_id, ''), external_user_id);

create unique index if not exists idx_messages_facebook_message_id
  on public.messages(facebook_message_id)
  where facebook_message_id is not null;

create index if not exists idx_conversations_page_updated
  on public.conversations(page_id, updated_at desc);

create index if not exists idx_messages_page_customer_created
  on public.messages(page_id, customer_psid, created_at);

create index if not exists idx_leads_page_customer
  on public.leads(page_id, customer_psid);
