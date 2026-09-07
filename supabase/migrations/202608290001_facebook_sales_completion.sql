create table if not exists public.facebook_pages (
  id uuid primary key default gen_random_uuid(),
  page_id text not null unique,
  page_name text not null,
  page_avatar_url text,
  page_access_token text,
  token_mask text,
  connected boolean not null default false,
  webhook_status text not null default 'unknown',
  last_webhook_at timestamptz,
  last_connection_check_at timestamptz,
  granted_permissions text[] not null default '{}',
  missing_permissions text[] not null default '{}',
  automation_enabled boolean not null default true,
  auto_reply_messenger boolean not null default true,
  ai_sales_mode boolean not null default true,
  auto_handoff boolean not null default true,
  auto_like_comments boolean not null default true,
  auto_reply_comments boolean not null default true,
  auto_hide_comments boolean not null default true,
  hide_phone_comments boolean not null default true,
  hide_keyword_comments boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations add column if not exists page_id text;
alter table public.conversation_state add column if not exists collected_address text;
alter table public.conversation_state add column if not exists collected_quantity text;
alter table public.conversation_state add column if not exists sales_state text not null default 'NEW';
alter table public.leads add column if not exists address text;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  page_id text not null,
  post_id text not null,
  comment_id text not null unique,
  parent_id text,
  external_user_id text,
  customer_id uuid references public.customers(id) on delete set null,
  message text not null,
  created_time timestamptz,
  is_from_page boolean not null default false,
  hidden boolean not null default false,
  liked boolean not null default false,
  replied boolean not null default false,
  classification jsonb not null default '{}',
  automation_result jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  content text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  customer_name text,
  phone text not null,
  address text not null,
  status text not null default 'PENDING_CONFIRMATION',
  source text not null default 'other',
  total_amount numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  variant text,
  quantity numeric not null default 1,
  unit_price numeric,
  amount numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rule_type text not null,
  config jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'default',
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(name)
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  page_id text,
  event_type text not null,
  payload jsonb not null default '{}',
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  message text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_facebook_pages_page_id on public.facebook_pages(page_id);
create index if not exists idx_comments_page_post on public.comments(page_id, post_id);
create index if not exists idx_comments_comment_id on public.comments(comment_id);
create index if not exists idx_orders_phone on public.orders(phone);
create index if not exists idx_orders_conversation on public.orders(conversation_id);
create index if not exists idx_webhook_events_key on public.webhook_events(event_key);
create index if not exists idx_activity_logs_created on public.activity_logs(created_at desc);

alter table public.facebook_pages enable row level security;
alter table public.comments enable row level security;
alter table public.sales_policies enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.automation_rules enable row level security;
alter table public.ai_settings enable row level security;
alter table public.webhook_events enable row level security;
alter table public.activity_logs enable row level security;
