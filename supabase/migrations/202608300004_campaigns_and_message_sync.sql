create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  page_scope text not null default 'all',
  segment_json jsonb not null default '{}',
  message_template text not null,
  status text not null default 'draft',
  total_recipients integer not null default 0,
  eligible_count integer not null default 0,
  skipped_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  page_id text,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_psid text,
  eligibility text not null default 'unknown',
  eligibility_reason text,
  status text not null default 'pending',
  message_text text,
  facebook_message_id text,
  error text,
  scheduled_at timestamptz default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, page_id, customer_psid)
);

create table if not exists public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations add column if not exists last_campaign_at timestamptz;
alter table public.conversations add column if not exists last_customer_message_at timestamptz;

create index if not exists idx_campaigns_status_updated on public.campaigns(status, updated_at desc);
create index if not exists idx_campaign_recipients_campaign_status on public.campaign_recipients(campaign_id, status);
create index if not exists idx_campaign_recipients_page_customer on public.campaign_recipients(page_id, customer_psid);
create index if not exists idx_conversations_last_customer_message on public.conversations(last_customer_message_at desc);

alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_templates enable row level security;
