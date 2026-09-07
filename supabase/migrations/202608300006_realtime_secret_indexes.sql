create index if not exists idx_conversations_last_message_at
  on public.conversations(last_message_at desc nulls last);

create index if not exists idx_conversations_page_customer
  on public.conversations(page_id, customer_psid);

create index if not exists idx_conversations_status
  on public.conversations(status);

create index if not exists idx_conversations_ai_enabled
  on public.conversations(ai_enabled);

create index if not exists idx_conversations_human_takeover
  on public.conversations(human_takeover);

create index if not exists idx_messages_conversation_created_desc
  on public.messages(conversation_id, created_at desc);

create index if not exists idx_campaign_recipients_campaign_status_updated
  on public.campaign_recipients(campaign_id, status, updated_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    execute 'alter publication supabase_realtime add table public.conversations';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end $$;
