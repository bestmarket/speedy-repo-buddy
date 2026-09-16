-- Roles ------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

do $$ begin
  create policy "Users read own roles" on public.user_roles
    for select to authenticated using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- AI providers (admin/service only; API keys never exposed to clients) -----
create table if not exists public.ai_providers (
  id text primary key,
  category text not null check (category in ('llm','tts','image')),
  label text not null,
  tier text not null check (tier in ('free','premium')),
  zero_cost boolean not null default false,
  requires_key boolean not null default true,
  enabled boolean not null default true,
  api_key text,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

grant all on public.ai_providers to service_role;
alter table public.ai_providers enable row level security;

create table if not exists public.ai_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant all on public.ai_settings to service_role;
alter table public.ai_settings enable row level security;

-- Usage telemetry ---------------------------------------------------------
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null,
  provider text not null,
  units numeric not null default 1,
  cost_usd numeric not null default 0,
  success boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_created_at_idx on public.usage_events (created_at desc);
create index if not exists usage_events_user_idx on public.usage_events (user_id);

grant all on public.usage_events to service_role;
alter table public.usage_events enable row level security;

-- Seed providers ----------------------------------------------------------
insert into public.ai_providers (id, category, label, tier, zero_cost, requires_key, sort_order) values
  ('gemini-flash', 'llm', 'Google Gemini 1.5 Flash (Free Tier)', 'free', true, false, 1),
  ('openai-gpt4o', 'llm', 'OpenAI GPT-4o', 'premium', false, true, 2),
  ('claude-sonnet', 'llm', 'Anthropic Claude 3.5 Sonnet', 'premium', false, true, 3),
  ('edge-tts', 'tts', 'edge-tts (Free)', 'free', true, false, 1),
  ('kokoro', 'tts', 'Kokoro-82M (Free/Local)', 'free', true, false, 2),
  ('elevenlabs', 'tts', 'ElevenLabs (Premium)', 'premium', false, true, 3),
  ('pollinations', 'image', 'Pollinations.ai (Free)', 'free', true, false, 1),
  ('huggingface', 'image', 'Hugging Face Inference API', 'free', true, true, 2),
  ('fal-flux', 'image', 'Fal.ai FLUX.1 (Schnell/Dev)', 'premium', false, true, 3),
  ('replicate', 'image', 'Replicate API', 'premium', false, true, 4)
on conflict (id) do nothing;

insert into public.ai_settings (key, value) values
  ('defaults', '{"llm":"gemini-flash","tts":"edge-tts","image":"pollinations"}'::jsonb),
  ('zero_cost_mode', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;