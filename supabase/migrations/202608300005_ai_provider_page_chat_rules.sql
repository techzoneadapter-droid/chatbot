alter table public.facebook_pages add column if not exists ai_provider text not null default 'openai';
alter table public.facebook_pages add column if not exists ai_model text;
alter table public.facebook_pages add column if not exists ai_fallback_provider text;
alter table public.facebook_pages add column if not exists ai_provider_fallback_enabled boolean not null default false;
alter table public.facebook_pages add column if not exists chat_rules jsonb not null default '{
  "ai_auto_reply": true,
  "human_takeover_default": false,
  "max_response_length": 900,
  "allow_emoji": true,
  "ask_phone": true,
  "ask_address": true,
  "auto_close_order": false,
  "auto_send_price": false,
  "after_hours_reply": true,
  "business_hours": "08:00-21:00",
  "after_hours_fallback": "Dạ hiện đã ngoài giờ làm việc, nhân viên sẽ phản hồi lại mình sớm nhất ạ.",
  "max_ai_followups": 4,
  "stop_on_not_interested": true,
  "stop_on_human_request": true
}'::jsonb;

alter table public.conversation_state add column if not exists conversation_summary text;
alter table public.conversation_state add column if not exists ai_confidence_status text;
alter table public.conversation_state add column if not exists last_ai_reply_at timestamptz;

create index if not exists idx_facebook_pages_ai_provider on public.facebook_pages(ai_provider);
create index if not exists idx_conversation_state_ai_confidence on public.conversation_state(ai_confidence_status);
