-- Minimal live migration for /image2-cases account-backed asset sync.
-- This intentionally excludes license-code membership tables/RPC so the first
-- Supabase smoke test can focus on login + cloud favorites/collections sync.

create table if not exists public.image2_asset_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot_version text not null default 'image2-assets-v1',
  snapshot jsonb not null default '{}'::jsonb,
  merged_from_local_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.image2_asset_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  source text,
  snapshot_version text,
  snapshot_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists image2_asset_events_user_id_created_at_idx
  on public.image2_asset_events (user_id, created_at desc);

alter table public.image2_asset_snapshots enable row level security;
alter table public.image2_asset_events enable row level security;

drop policy if exists "image2 asset snapshots read own" on public.image2_asset_snapshots;
create policy "image2 asset snapshots read own"
  on public.image2_asset_snapshots
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "image2 asset snapshots insert own" on public.image2_asset_snapshots;
create policy "image2 asset snapshots insert own"
  on public.image2_asset_snapshots
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "image2 asset snapshots update own" on public.image2_asset_snapshots;
create policy "image2 asset snapshots update own"
  on public.image2_asset_snapshots
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "image2 asset events read own" on public.image2_asset_events;
create policy "image2 asset events read own"
  on public.image2_asset_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "image2 asset events insert own" on public.image2_asset_events;
create policy "image2 asset events insert own"
  on public.image2_asset_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

comment on table public.image2_asset_snapshots is
  'Image2 cases local-first asset snapshot used by account-backed cloud sync.';

comment on table public.image2_asset_events is
  'Append-only lightweight telemetry for Image2 asset sync actions.';
