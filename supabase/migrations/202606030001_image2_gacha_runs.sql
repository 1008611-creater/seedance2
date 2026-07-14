-- Image2 case-library gacha runs and reusable style recipes.
-- Apply before setting IMAGE2_GACHA_BACKEND=supabase.

create extension if not exists pgcrypto;

create or replace function public.image2_gacha_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.image2_gacha_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_case_key text not null,
  mode text not null check (mode in ('single', 'pack')),
  status text not null default 'draft' check (status in ('draft', 'drawing', 'partial', 'done', 'failed')),
  draw_count integer not null default 1 check (draw_count between 1 and 9),
  target_slots integer not null default 1 check (target_slots between 1 and 9),
  source_case jsonb not null default '{}'::jsonb,
  params jsonb not null default '{}'::jsonb,
  user_goal text not null default '',
  cards jsonb not null default '[]'::jsonb,
  job_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint image2_gacha_runs_source_case_shape check (jsonb_typeof(source_case) = 'object'),
  constraint image2_gacha_runs_params_shape check (jsonb_typeof(params) = 'object'),
  constraint image2_gacha_runs_cards_shape check (jsonb_typeof(cards) = 'array'),
  constraint image2_gacha_runs_draw_slots_check check (draw_count <= target_slots)
);

create table if not exists public.image2_gacha_recipes (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id text not null references public.image2_gacha_runs(run_id) on delete cascade,
  card_id text not null,
  source_case_key text not null,
  title text not null,
  created_at timestamptz not null default now()
);

drop trigger if exists image2_gacha_runs_set_updated_at on public.image2_gacha_runs;
create trigger image2_gacha_runs_set_updated_at
  before update on public.image2_gacha_runs
  for each row execute function public.image2_gacha_set_updated_at();

create index if not exists image2_gacha_runs_user_updated_idx
  on public.image2_gacha_runs(user_id, updated_at desc);
create index if not exists image2_gacha_runs_user_source_idx
  on public.image2_gacha_runs(user_id, source_case_key, updated_at desc);
create index if not exists image2_gacha_runs_user_job_idx
  on public.image2_gacha_runs(user_id, job_id)
  where job_id is not null;
create index if not exists image2_gacha_recipes_user_created_idx
  on public.image2_gacha_recipes(user_id, created_at desc);
create index if not exists image2_gacha_recipes_user_source_idx
  on public.image2_gacha_recipes(user_id, source_case_key, created_at desc);

alter table public.image2_gacha_runs enable row level security;
alter table public.image2_gacha_recipes enable row level security;

drop policy if exists image2_gacha_runs_select_own on public.image2_gacha_runs;
create policy image2_gacha_runs_select_own
  on public.image2_gacha_runs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists image2_gacha_runs_insert_own on public.image2_gacha_runs;
create policy image2_gacha_runs_insert_own
  on public.image2_gacha_runs for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists image2_gacha_runs_update_own on public.image2_gacha_runs;
create policy image2_gacha_runs_update_own
  on public.image2_gacha_runs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists image2_gacha_runs_delete_own on public.image2_gacha_runs;
create policy image2_gacha_runs_delete_own
  on public.image2_gacha_runs for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists image2_gacha_recipes_select_own on public.image2_gacha_recipes;
create policy image2_gacha_recipes_select_own
  on public.image2_gacha_recipes for select to authenticated
  using (user_id = auth.uid());

drop policy if exists image2_gacha_recipes_insert_own on public.image2_gacha_recipes;
create policy image2_gacha_recipes_insert_own
  on public.image2_gacha_recipes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists image2_gacha_recipes_delete_own on public.image2_gacha_recipes;
create policy image2_gacha_recipes_delete_own
  on public.image2_gacha_recipes for delete to authenticated
  using (user_id = auth.uid());

comment on table public.image2_gacha_runs is
  'Image2 case-library gacha runs created from favorited case images.';

comment on table public.image2_gacha_recipes is
  'Reusable high-score Image2 gacha recipes saved from SSR/SR cards.';
