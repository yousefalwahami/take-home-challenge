-- Run this in Supabase → SQL Editor (or supabase db push).
-- App keys users by Google email from Auth.js.

create table if not exists public.voice_profiles (
  user_email text primary key,
  style_brief text not null,
  examples jsonb not null default '[]'::jsonb,
  sample_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.triaged_messages (
  user_email text not null,
  gmail_id text not null,
  thread_id text not null default '',
  subject text not null default '',
  from_header text not null default '',
  date_header text not null default '',
  snippet text not null default '',
  body_preview text not null default '',
  bucket text not null check (bucket in ('needs_reply', 'fyi', 'ignore')),
  reason text not null default '',
  draft text,
  gmail_draft_id text,
  first_triaged_at timestamptz not null default now(),
  last_triaged_at timestamptz not null default now(),
  primary key (user_email, gmail_id)
);

create index if not exists triaged_messages_user_last_idx
  on public.triaged_messages (user_email, last_triaged_at desc);

-- Service role from the Next.js server only (never expose to the browser).
alter table public.voice_profiles enable row level security;
alter table public.triaged_messages enable row level security;
