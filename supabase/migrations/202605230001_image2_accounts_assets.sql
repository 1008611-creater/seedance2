-- Image2 account, asset sync, license, entitlement, and generation schema.
-- Apply this migration in Supabase after enabling email/password Auth.

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

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default 'Creator',
  role text not null default 'user' check (role in ('user', 'admin')),
  claimed_trial_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1), 'Creator')
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create table if not exists public.image2_asset_snapshots (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  snapshot_version text not null default 'image2-assets-v1' check (snapshot_version = 'image2-assets-v1'),
  snapshot jsonb not null default '{
    "version": "image2-assets-v1",
    "favoriteCaseKeys": [],
    "activeCollectionId": null,
    "collections": [],
    "notes": {},
    "promptDrafts": {},
    "promptReuseHistory": [],
    "updatedAt": ""
  }'::jsonb,
  merged_from_local_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint image2_asset_snapshots_shape check (jsonb_typeof(snapshot) = 'object')
);

create table if not exists public.image2_asset_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('sync_upload', 'sync_merge', 'favorite', 'unfavorite', 'copy_prompt', 'save_variant', 'export')),
  case_key text,
  source text not null default 'web',
  snapshot_version text,
  snapshot_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.image2_prompt_variants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  case_key text not null,
  case_title text not null default 'Untitled case',
  name text not null default 'Untitled variant',
  prompt text not null,
  fields jsonb not null default '{}'::jsonb,
  note text not null default '',
  source text not null default 'workbench',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint image2_prompt_variants_fields_shape check (jsonb_typeof(fields) = 'object')
);

create table if not exists public.license_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  hash_algorithm text not null default 'sha256:upper-trim',
  plan text not null default 'weekly_free',
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'disabled')),
  max_redemptions integer not null default 1 check (max_redemptions > 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  disabled_at timestamptz,
  disabled_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint license_codes_redeemed_count_check check (redeemed_count <= max_redemptions),
  constraint license_codes_dates_check check (expires_at is null or expires_at > valid_from),
  constraint license_codes_metadata_shape check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'license' check (source in ('license', 'trial', 'admin', 'migration')),
  source_license_id uuid references public.license_codes(id) on delete set null,
  plan text not null default 'weekly_free',
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  daily_limit integer not null default 2 check (daily_limit >= 0),
  resolution text not null default '720p',
  max_duration_seconds integer not null default 15 check (max_duration_seconds > 0),
  can_cloud_sync boolean not null default true,
  can_prompt_workbench boolean not null default false,
  can_bulk_export boolean not null default false,
  can_member_cases boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_time_window_check check (ends_at > starts_at)
);

create table if not exists public.license_redemptions (
  id uuid primary key default gen_random_uuid(),
  license_code_id uuid references public.license_codes(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entitlement_id uuid references public.entitlements(id) on delete set null,
  request_hash text,
  result text not null check (result in ('succeeded', 'invalid', 'expired', 'disabled', 'exhausted', 'duplicate', 'failed')),
  failure_reason text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  usage_key text not null default 'seedance-generation',
  used_count integer not null default 0 check (used_count >= 0),
  limit_count integer not null default 2 check (limit_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, usage_date, usage_key),
  constraint daily_usage_used_limit_check check (used_count <= limit_count)
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entitlement_id uuid references public.entitlements(id) on delete set null,
  title text not null default 'Untitled generation',
  prompt text not null,
  mode text not null,
  ratio text not null default '16:9',
  resolution text not null default '720p',
  duration_seconds integer not null default 15,
  style text,
  seed integer,
  generate_audio boolean not null default false,
  privacy text not null default 'private' check (privacy in ('private', 'link')),
  assets jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'expired')),
  progress integer not null default 0 check (progress between 0 and 100),
  provider text not null default 'manual' check (provider in ('manual', 'seedance')),
  provider_task_id text,
  cover_url text,
  video_url text,
  last_frame_url text,
  error_message text,
  operator_name text,
  external_account text,
  source_task_url text,
  operator_note text,
  user_message text,
  refunded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generations_assets_shape check (jsonb_typeof(assets) = 'array')
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_image2_asset_snapshots_updated_at on public.image2_asset_snapshots;
create trigger set_image2_asset_snapshots_updated_at
  before update on public.image2_asset_snapshots
  for each row execute function public.set_updated_at();

drop trigger if exists set_image2_prompt_variants_updated_at on public.image2_prompt_variants;
create trigger set_image2_prompt_variants_updated_at
  before update on public.image2_prompt_variants
  for each row execute function public.set_updated_at();

drop trigger if exists set_license_codes_updated_at on public.license_codes;
create trigger set_license_codes_updated_at
  before update on public.license_codes
  for each row execute function public.set_updated_at();

drop trigger if exists set_entitlements_updated_at on public.entitlements;
create trigger set_entitlements_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

drop trigger if exists set_daily_usage_updated_at on public.daily_usage;
create trigger set_daily_usage_updated_at
  before update on public.daily_usage
  for each row execute function public.set_updated_at();

drop trigger if exists set_generations_updated_at on public.generations;
create trigger set_generations_updated_at
  before update on public.generations
  for each row execute function public.set_updated_at();

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists image2_asset_events_user_created_idx on public.image2_asset_events(user_id, created_at desc);
create index if not exists image2_asset_events_case_idx on public.image2_asset_events(case_key);
create index if not exists image2_prompt_variants_user_case_idx on public.image2_prompt_variants(user_id, case_key, updated_at desc);
create index if not exists license_codes_status_idx on public.license_codes(status);
create index if not exists license_codes_expires_at_idx on public.license_codes(expires_at);
create index if not exists license_redemptions_user_created_idx on public.license_redemptions(user_id, created_at desc);
create index if not exists license_redemptions_code_user_idx on public.license_redemptions(license_code_id, user_id);
create index if not exists entitlements_user_status_idx on public.entitlements(user_id, status, ends_at desc);
create index if not exists daily_usage_user_date_idx on public.daily_usage(user_id, usage_date desc);
create index if not exists generations_user_created_idx on public.generations(user_id, created_at desc);
create index if not exists generations_provider_task_idx on public.generations(provider_task_id) where provider_task_id is not null;
create index if not exists generations_status_idx on public.generations(status);

alter table public.profiles enable row level security;
alter table public.image2_asset_snapshots enable row level security;
alter table public.image2_asset_events enable row level security;
alter table public.image2_prompt_variants enable row level security;
alter table public.license_codes enable row level security;
alter table public.entitlements enable row level security;
alter table public.license_redemptions enable row level security;
alter table public.daily_usage enable row level security;
alter table public.generations enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_own_user on public.profiles;
create policy profiles_insert_own_user
  on public.profiles for insert to authenticated
  with check (id = auth.uid() and role = 'user' and claimed_trial_at is null);

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all
  on public.profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists image2_asset_snapshots_select_own on public.image2_asset_snapshots;
create policy image2_asset_snapshots_select_own
  on public.image2_asset_snapshots for select to authenticated
  using (user_id = auth.uid());

drop policy if exists image2_asset_snapshots_insert_own on public.image2_asset_snapshots;
create policy image2_asset_snapshots_insert_own
  on public.image2_asset_snapshots for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists image2_asset_snapshots_update_own on public.image2_asset_snapshots;
create policy image2_asset_snapshots_update_own
  on public.image2_asset_snapshots for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists image2_asset_snapshots_delete_own on public.image2_asset_snapshots;
create policy image2_asset_snapshots_delete_own
  on public.image2_asset_snapshots for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists image2_asset_events_select_own on public.image2_asset_events;
create policy image2_asset_events_select_own
  on public.image2_asset_events for select to authenticated
  using (user_id = auth.uid());

drop policy if exists image2_asset_events_insert_own on public.image2_asset_events;
create policy image2_asset_events_insert_own
  on public.image2_asset_events for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists image2_prompt_variants_select_own on public.image2_prompt_variants;
create policy image2_prompt_variants_select_own
  on public.image2_prompt_variants for select to authenticated
  using (user_id = auth.uid());

drop policy if exists image2_prompt_variants_insert_own on public.image2_prompt_variants;
create policy image2_prompt_variants_insert_own
  on public.image2_prompt_variants for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists image2_prompt_variants_update_own on public.image2_prompt_variants;
create policy image2_prompt_variants_update_own
  on public.image2_prompt_variants for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists image2_prompt_variants_delete_own on public.image2_prompt_variants;
create policy image2_prompt_variants_delete_own
  on public.image2_prompt_variants for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists license_codes_admin_all on public.license_codes;
create policy license_codes_admin_all
  on public.license_codes for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists entitlements_select_own on public.entitlements;
create policy entitlements_select_own
  on public.entitlements for select to authenticated
  using (user_id = auth.uid());

drop policy if exists entitlements_admin_all on public.entitlements;
create policy entitlements_admin_all
  on public.entitlements for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists license_redemptions_select_own on public.license_redemptions;
create policy license_redemptions_select_own
  on public.license_redemptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists license_redemptions_admin_all on public.license_redemptions;
create policy license_redemptions_admin_all
  on public.license_redemptions for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists daily_usage_select_own on public.daily_usage;
create policy daily_usage_select_own
  on public.daily_usage for select to authenticated
  using (user_id = auth.uid());

drop policy if exists daily_usage_admin_all on public.daily_usage;
create policy daily_usage_admin_all
  on public.daily_usage for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists generations_select_own on public.generations;
create policy generations_select_own
  on public.generations for select to authenticated
  using (user_id = auth.uid());

drop policy if exists generations_admin_all on public.generations;
create policy generations_admin_all
  on public.generations for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.redeem_license_code(
  p_code_hash text,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_license public.license_codes%rowtype;
  v_entitlement public.entitlements%rowtype;
  v_now timestamptz := now();
  v_result text;
  v_reason text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  insert into public.profiles (id, display_name)
  values (v_user_id, 'Creator')
  on conflict (id) do nothing;

  select *
  into v_license
  from public.license_codes
  where code_hash = p_code_hash
  for update;

  if not found then
    insert into public.license_redemptions (user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_user_id, p_code_hash, 'invalid', 'license_not_found', p_ip_hash, left(coalesce(p_user_agent, ''), 500));

    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if exists (
    select 1
    from public.license_redemptions
    where license_code_id = v_license.id
      and user_id = v_user_id
      and result = 'succeeded'
  ) then
    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, v_user_id, p_code_hash, 'duplicate', 'already_redeemed_by_user', p_ip_hash, left(coalesce(p_user_agent, ''), 500));

    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  if v_license.status = 'disabled' then
    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, v_user_id, p_code_hash, 'disabled', coalesce(v_license.disabled_reason, 'license_disabled'), p_ip_hash, left(coalesce(p_user_agent, ''), 500));

    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;

  if v_license.status = 'expired' or (v_license.expires_at is not null and v_license.expires_at <= v_now) then
    update public.license_codes
    set status = 'expired'
    where id = v_license.id
      and status = 'active';

    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, v_user_id, p_code_hash, 'expired', 'license_expired', p_ip_hash, left(coalesce(p_user_agent, ''), 500));

    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if v_license.status = 'used' or v_license.redeemed_count >= v_license.max_redemptions then
    update public.license_codes
    set status = 'used'
    where id = v_license.id
      and status = 'active';

    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, v_user_id, p_code_hash, 'exhausted', 'license_exhausted', p_ip_hash, left(coalesce(p_user_agent, ''), 500));

    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  if v_license.status <> 'active' then
    v_result := 'failed';
    v_reason := 'license_not_active';

    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, v_user_id, p_code_hash, v_result, v_reason, p_ip_hash, left(coalesce(p_user_agent, ''), 500));

    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;

  insert into public.entitlements (
    user_id,
    source,
    source_license_id,
    plan,
    starts_at,
    ends_at,
    daily_limit,
    resolution,
    max_duration_seconds,
    can_cloud_sync,
    can_prompt_workbench,
    can_bulk_export,
    can_member_cases
  )
  values (
    v_user_id,
    'license',
    v_license.id,
    v_license.plan,
    v_now,
    v_now + interval '7 days',
    2,
    '720p',
    15,
    true,
    v_license.plan <> 'weekly_free',
    v_license.plan <> 'weekly_free',
    v_license.plan <> 'weekly_free'
  )
  returning * into v_entitlement;

  update public.license_codes
  set redeemed_count = redeemed_count + 1,
      status = case
        when redeemed_count + 1 >= max_redemptions then 'used'
        else status
      end
  where id = v_license.id;

  insert into public.license_redemptions (license_code_id, user_id, entitlement_id, request_hash, result, ip_hash, user_agent)
  values (v_license.id, v_user_id, v_entitlement.id, p_code_hash, 'succeeded', p_ip_hash, left(coalesce(p_user_agent, ''), 500));

  return jsonb_build_object(
    'ok', true,
    'entitlementId', v_entitlement.id,
    'plan', v_entitlement.plan,
    'startsAt', v_entitlement.starts_at,
    'endsAt', v_entitlement.ends_at
  );
end;
$$;

revoke all on function public.redeem_license_code(text, text, text) from public;
grant execute on function public.redeem_license_code(text, text, text) to authenticated;

comment on table public.image2_asset_snapshots is 'Cloud copy of the image2-assets-v1 local asset snapshot.';
comment on table public.license_codes is 'Stores license code hashes only. Never store plaintext license codes.';
comment on function public.redeem_license_code(text, text, text) is 'Redeems a hashed license code for the current authenticated user and writes redemption audit rows.';
