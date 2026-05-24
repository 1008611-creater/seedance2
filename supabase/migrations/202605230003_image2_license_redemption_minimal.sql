-- Minimal Image2 license redemption schema.
-- Stores license code hashes only; never store plaintext license codes.

drop function if exists public.redeem_license_code(text, text, text);

drop table if exists public.license_redemptions;
drop table if exists public.entitlements;
drop table if exists public.license_codes;

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint license_codes_redeemed_le_max_check check (redeemed_count <= max_redemptions),
  constraint license_codes_dates_check check (expires_at is null or expires_at > valid_from),
  constraint license_codes_metadata_shape check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id uuid references public.entitlements(id) on delete set null,
  request_hash text,
  result text not null check (result in ('succeeded', 'invalid', 'expired', 'disabled', 'exhausted', 'duplicate', 'failed')),
  failure_reason text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

drop trigger if exists image2_license_codes_set_updated_at on public.license_codes;
create trigger image2_license_codes_set_updated_at
  before update on public.license_codes
  for each row execute function public.image2_set_updated_at();

drop trigger if exists image2_entitlements_set_updated_at on public.entitlements;
create trigger image2_entitlements_set_updated_at
  before update on public.entitlements
  for each row execute function public.image2_set_updated_at();

create index if not exists license_codes_status_idx on public.license_codes(status);
create index if not exists license_codes_expires_at_idx on public.license_codes(expires_at);
create index if not exists license_redemptions_user_created_idx on public.license_redemptions(user_id, created_at desc);
create index if not exists license_redemptions_code_user_idx on public.license_redemptions(license_code_id, user_id);
create index if not exists entitlements_user_status_idx on public.entitlements(user_id, status, ends_at desc);

alter table public.license_codes enable row level security;
alter table public.entitlements enable row level security;
alter table public.license_redemptions enable row level security;

drop policy if exists entitlements_select_own on public.entitlements;
create policy entitlements_select_own
  on public.entitlements for select to authenticated
  using (user_id = auth.uid());

drop policy if exists license_redemptions_select_own on public.license_redemptions;
create policy license_redemptions_select_own
  on public.license_redemptions for select to authenticated
  using (user_id = auth.uid());

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
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

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
    where id = v_license.id and status = 'active';

    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, v_user_id, p_code_hash, 'expired', 'license_expired', p_ip_hash, left(coalesce(p_user_agent, ''), 500));
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if v_license.status = 'used' or v_license.redeemed_count >= v_license.max_redemptions then
    update public.license_codes
    set status = 'used'
    where id = v_license.id and status = 'active';

    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, v_user_id, p_code_hash, 'exhausted', 'license_exhausted', p_ip_hash, left(coalesce(p_user_agent, ''), 500));
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  if v_license.status <> 'active' then
    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, v_user_id, p_code_hash, 'failed', 'license_not_active', p_ip_hash, left(coalesce(p_user_agent, ''), 500));
    return jsonb_build_object('ok', false, 'reason', 'license_not_active');
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

comment on table public.license_codes is 'Stores license code hashes only. Never store plaintext license codes.';
comment on table public.entitlements is 'Image2 membership entitlements created by license redemption or future admin grants.';
comment on table public.license_redemptions is 'Audit rows for Image2 license redemption attempts; request_hash and ip_hash are hashed.';
comment on function public.redeem_license_code(text, text, text) is 'Redeems a hashed license code for the current authenticated user and writes redemption audit rows.';

select pg_notify('pgrst', 'reload schema');
