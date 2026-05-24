-- Image2 workbench shared library: team assets, generated results, and feedback.
-- Apply this after the base Image2 Supabase migration. The application uses
-- the server-only service role key for writes and signed Storage URLs for image reads.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'image2-workbench-media',
  'image2-workbench-media',
  false,
  12582912,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.image2_workbench_assets (
  id text primary key,
  workspace_id text not null default 'image2-workbench-main',
  kind text not null check (kind in ('person', 'clothing', 'scene', 'motion', 'result')),
  group_label text not null check (group_label in ('人物', '服装', '场景', '动作', '结果')),
  title text not null,
  subtitle text not null default '',
  note text not null default '',
  source_path text not null,
  preview_path text not null,
  tags text[] not null default '{}',
  prompt_hint text not null default '',
  ratio text,
  origin text not null default 'upload' check (origin in ('master', 'upload', 'generated')),
  stage text check (stage in ('outfit', 'first-frame')),
  prompt text,
  storage_bucket text,
  storage_object_path text,
  mime_type text check (mime_type is null or mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint image2_workbench_assets_metadata_shape check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.image2_workbench_feedback (
  id text primary key,
  workspace_id text not null default 'image2-workbench-main',
  asset_id text not null,
  stage text not null check (stage in ('outfit', 'first-frame', 'manual')),
  rating text not null check (rating in ('usable', 'needs-fix', 'reject')),
  reasons text[] not null default '{}',
  note text,
  prompt text,
  reference_ids text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint image2_workbench_feedback_metadata_shape check (jsonb_typeof(metadata) = 'object')
);

drop trigger if exists set_image2_workbench_assets_updated_at on public.image2_workbench_assets;
create trigger set_image2_workbench_assets_updated_at
  before update on public.image2_workbench_assets
  for each row execute function public.set_updated_at();

create index if not exists image2_workbench_assets_workspace_created_idx
  on public.image2_workbench_assets (workspace_id, created_at desc);
create index if not exists image2_workbench_assets_workspace_kind_idx
  on public.image2_workbench_assets (workspace_id, kind, created_at desc);
create index if not exists image2_workbench_assets_workspace_stage_idx
  on public.image2_workbench_assets (workspace_id, stage, created_at desc);
create index if not exists image2_workbench_feedback_workspace_created_idx
  on public.image2_workbench_feedback (workspace_id, created_at desc);
create index if not exists image2_workbench_feedback_asset_created_idx
  on public.image2_workbench_feedback (asset_id, created_at desc);

alter table public.image2_workbench_assets enable row level security;
alter table public.image2_workbench_feedback enable row level security;

drop policy if exists "image2 workbench assets service all" on public.image2_workbench_assets;
create policy "image2 workbench assets service all"
  on public.image2_workbench_assets
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "image2 workbench feedback service all" on public.image2_workbench_feedback;
create policy "image2 workbench feedback service all"
  on public.image2_workbench_feedback
  for all
  to service_role
  using (true)
  with check (true);

-- Keep the media bucket private. Team-only API routes issue short-lived signed URLs
-- after Supabase login and email whitelist checks.
drop policy if exists "image2 workbench media public read" on storage.objects;

drop policy if exists "image2 workbench media service insert" on storage.objects;
create policy "image2 workbench media service insert"
  on storage.objects
  for insert
  to service_role
  with check (bucket_id = 'image2-workbench-media');

drop policy if exists "image2 workbench media service update" on storage.objects;
create policy "image2 workbench media service update"
  on storage.objects
  for update
  to service_role
  using (bucket_id = 'image2-workbench-media')
  with check (bucket_id = 'image2-workbench-media');

drop policy if exists "image2 workbench media service delete" on storage.objects;
create policy "image2 workbench media service delete"
  on storage.objects
  for delete
  to service_role
  using (bucket_id = 'image2-workbench-media');

comment on table public.image2_workbench_assets is
  'Shared Image2 workbench matrix assets and generated result images for the team workflow.';

comment on table public.image2_workbench_feedback is
  'Lightweight post-generation feedback linked to shared Image2 workbench assets.';
