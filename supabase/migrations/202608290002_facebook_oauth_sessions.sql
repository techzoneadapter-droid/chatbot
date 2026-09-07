create table if not exists public.facebook_oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  pages jsonb not null default '[]',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_facebook_oauth_sessions_session_id on public.facebook_oauth_sessions(session_id);
create index if not exists idx_facebook_oauth_sessions_expires_at on public.facebook_oauth_sessions(expires_at);

alter table public.facebook_oauth_sessions enable row level security;
