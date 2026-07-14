-- Public picture studio username accounts and generation history.
-- Passwords are managed by Supabase Auth; this migration stores no plaintext passwords, session tokens, or cookies.

create extension if not exists pgcrypto;

create or replace function public.image2_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.picture_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  last_login_at timestamptz,
  login_count integer not null default 0 check (login_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint picture_accounts_username_shape check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint picture_accounts_metadata_shape check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.picture_generation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 2000),
  mode text not null check (mode in ('text-to-image', 'image-to-image', 'smart-edit')),
  channel text not null check (channel in ('auto', 'fast', 'stable')),
  ratio text not null check (ratio in ('1:1', '3:4', '9:16', '16:9')),
  resolution text not null check (resolution in ('1k', '2k', '4k')),
  seed bigint check (seed is null or seed > 0),
  images jsonb not null default '[]'::jsonb,
  elapsed_seconds numeric(10, 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint picture_generation_runs_images_shape check (jsonb_typeof(images) = 'array'),
  constraint picture_generation_runs_metadata_shape check (jsonb_typeof(metadata) = 'object')
);

drop trigger if exists picture_accounts_set_updated_at on public.picture_accounts;
create trigger picture_accounts_set_updated_at
  before update on public.picture_accounts
  for each row execute function public.image2_set_updated_at();

create index if not exists picture_accounts_username_idx on public.picture_accounts (username);
create index if not exists picture_accounts_last_login_idx on public.picture_accounts (last_login_at desc nulls last);
create index if not exists picture_generation_runs_user_created_idx on public.picture_generation_runs (user_id, created_at desc);
create index if not exists picture_generation_runs_created_idx on public.picture_generation_runs (created_at desc);

alter table public.picture_accounts enable row level security;
alter table public.picture_generation_runs enable row level security;

drop policy if exists picture_accounts_select_own on public.picture_accounts;
create policy picture_accounts_select_own
  on public.picture_accounts for select to authenticated
  using (user_id = auth.uid());

drop policy if exists picture_accounts_update_own on public.picture_accounts;
create policy picture_accounts_update_own
  on public.picture_accounts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists picture_generation_runs_select_own on public.picture_generation_runs;
create policy picture_generation_runs_select_own
  on public.picture_generation_runs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists picture_generation_runs_insert_own on public.picture_generation_runs;
create policy picture_generation_runs_insert_own
  on public.picture_generation_runs for insert to authenticated
  with check (user_id = auth.uid());

comment on table public.picture_accounts is 'Username mapping for the public AI picture studio. Passwords remain in Supabase Auth.';
comment on table public.picture_generation_runs is 'Per-user generated picture history with public output paths and non-secret parameters.';

select pg_notify('pgrst', 'reload schema');
