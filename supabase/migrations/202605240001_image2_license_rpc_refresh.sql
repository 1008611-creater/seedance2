-- Recreate the Image2 license redemption RPC without touching table data.
-- Use this if the three license tables exist but PostgREST cannot see redeem_license_code yet.

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

comment on function public.redeem_license_code(text, text, text) is 'Redeems a hashed license code for the current authenticated user and writes redemption audit rows.';

select pg_notify('pgrst', 'reload schema');

with rpc_presence as (
  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'redeem_license_code'
  ) as has_redeem_license_code
)
select has_redeem_license_code from rpc_presence;
