create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  role text not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  external_user_id text not null,
  name text,
  phone text,
  location text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform, external_user_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  external_user_id text not null,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'OPEN',
  ai_enabled boolean not null default true,
  assigned_staff_id uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','ai','staff','system')),
  message text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  category text not null,
  description text not null,
  interior_or_exterior text not null default 'both',
  main_benefits text[] not null default '{}',
  suitable_surfaces text[] not null default '{}',
  suitable_projects text[] not null default '{}',
  coverage text,
  coverage_value numeric,
  coats numeric,
  available_sizes text[] not null default '{}',
  price numeric,
  price_unit text,
  discount text,
  warranty text,
  technical_info jsonb not null default '{}',
  application_instructions text,
  drying_time text,
  color_info text,
  features text[] not null default '{}',
  suitable_for text[] not null default '{}',
  faq jsonb not null default '{}',
  active boolean not null default true,
  featured boolean not null default false,
  sort_order integer not null default 100,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_name text,
  phone text,
  normalized_phone text,
  location text,
  project_type text,
  area text,
  floors text,
  interested_products text[] default '{}',
  budget text,
  source text not null default 'local_chat',
  intent text not null default 'unknown',
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  status text not null default 'NEW',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_state (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  current_intent text not null default 'unknown',
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  scored_signals text[] not null default '{}',
  collected_name text,
  collected_phone text,
  collected_location text,
  collected_floors text,
  collected_project_type text,
  collected_area text,
  collected_product_interest text,
  collected_budget text,
  last_question text,
  qualification_stage text not null default 'discovery',
  should_request_phone boolean not null default false,
  should_handoff boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversations_platform_external on public.conversations(platform, external_user_id);
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at);
create index if not exists idx_leads_status_score on public.leads(status, lead_score desc);
create index if not exists idx_leads_phone on public.leads(normalized_phone);
create index if not exists idx_products_active_category on public.products(active, category);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.leads enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.conversation_state enable row level security;
alter table public.lead_events enable row level security;
alter table public.settings enable row level security;
