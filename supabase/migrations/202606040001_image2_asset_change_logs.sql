-- Image2 asset snapshot change logs and admin undo markers.
-- Apply before relying on /admin/image2-cases change history in Supabase mode.

create extension if not exists pgcrypto;

create table if not exists public.image2_asset_change_logs (
  id uuid primary key default gen_random_uuid(),
  change_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('asset_snapshot_save', 'admin_undo_asset_snapshot')),
  source text not null default 'image2-assets',
  reason text not null default '',
  actor jsonb not null default '{"type":"system"}'::jsonb,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  undone_at timestamptz,
  undone_by text,
  undo_change_id text,
  created_at timestamptz not null default now(),
  constraint image2_asset_change_logs_actor_shape check (jsonb_typeof(actor) = 'object'),
  constraint image2_asset_change_logs_before_shape check (jsonb_typeof(before_snapshot) = 'object'),
  constraint image2_asset_change_logs_after_shape check (jsonb_typeof(after_snapshot) = 'object'),
  constraint image2_asset_change_logs_summary_shape check (jsonb_typeof(summary) = 'object')
);

create index if not exists image2_asset_change_logs_created_idx
  on public.image2_asset_change_logs(created_at desc);

create index if not exists image2_asset_change_logs_user_created_idx
  on public.image2_asset_change_logs(user_id, created_at desc);

create index if not exists image2_asset_change_logs_undo_idx
  on public.image2_asset_change_logs(undo_change_id)
  where undo_change_id is not null;

alter table public.image2_asset_change_logs enable row level security;

drop policy if exists image2_asset_change_logs_select_own on public.image2_asset_change_logs;
create policy image2_asset_change_logs_select_own
  on public.image2_asset_change_logs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists image2_asset_change_logs_insert_own on public.image2_asset_change_logs;
create policy image2_asset_change_logs_insert_own
  on public.image2_asset_change_logs for insert to authenticated
  with check (user_id = auth.uid());

-- Admin operations are performed by the Next.js server with SUPABASE_SERVICE_ROLE_KEY.
-- Supabase service-role requests bypass RLS, which is the intended path for:
-- - /api/admin/image2-cases/changes GET list
-- - /api/admin/image2-cases/changes POST undo
-- The browser never receives the service-role key.

comment on table public.image2_asset_change_logs is
  'Append-only Image2 user asset snapshot change logs for admin review and undo.';

comment on column public.image2_asset_change_logs.before_snapshot is
  'Normalized image2-assets-v1 snapshot before the change.';

comment on column public.image2_asset_change_logs.after_snapshot is
  'Normalized image2-assets-v1 snapshot after the change.';
