-- Unified account profiles and auth event audit for Image2 / Scene.
-- Do not store OTP codes, access tokens, cookies, or plaintext secrets here.

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

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  display_name text,
  source_host text,
  source_site text not null default 'image2',
  last_login_at timestamptz,
  login_count integer not null default 0 check (login_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_metadata_shape check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('otp_send', 'otp_verify', 'login', 'logout', 'admin_read')),
  identifier_type text check (identifier_type in ('email', 'phone')),
  identifier_hash text,
  ip_hash text,
  user_agent text,
  host text,
  success boolean not null default false,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint auth_events_metadata_shape check (jsonb_typeof(metadata) = 'object')
);

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.image2_set_updated_at();

create index if not exists user_profiles_email_idx on public.user_profiles (lower(email)) where email is not null;
create index if not exists user_profiles_phone_idx on public.user_profiles (phone) where phone is not null;
create index if not exists user_profiles_last_login_idx on public.user_profiles (last_login_at desc nulls last);
create index if not exists auth_events_user_created_idx on public.auth_events (user_id, created_at desc);
create index if not exists auth_events_identifier_created_idx on public.auth_events (identifier_hash, created_at desc);
create index if not exists auth_events_host_created_idx on public.auth_events (host, created_at desc);

alter table public.user_profiles enable row level security;
alter table public.auth_events enable row level security;

drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_own
  on public.user_profiles for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_profiles_insert_own on public.user_profiles;
create policy user_profiles_insert_own
  on public.user_profiles for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_profiles_update_own on public.user_profiles;
create policy user_profiles_update_own
  on public.user_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists auth_events_select_own on public.auth_events;
create policy auth_events_select_own
  on public.auth_events for select to authenticated
  using (user_id = auth.uid());

comment on table public.user_profiles is 'Unified business profile for Image2 and Scene accounts. Does not store auth tokens or OTP codes.';
comment on table public.auth_events is 'Hashed audit trail for auth attempts. Does not store OTP codes, tokens, or plaintext IP addresses.';

select pg_notify('pgrst', 'reload schema');
