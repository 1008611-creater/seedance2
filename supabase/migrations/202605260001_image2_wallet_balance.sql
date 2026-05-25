-- Image2 balance wallet for paid image quota packs.
-- License codes still store hashes only; new credit packs are represented by
-- license_codes.plan and license_codes.metadata->>'credits'.

create extension if not exists pgcrypto;

create table if not exists public.image2_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_credited integer not null default 0 check (lifetime_credited >= 0),
  lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.image2_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  type text not null check (type in ('redeem', 'spend', 'refund', 'admin', 'adjustment')),
  source text,
  source_id uuid,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint image2_wallet_transactions_metadata_shape check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.image2_wallet_redemptions (
  id uuid primary key default gen_random_uuid(),
  license_code_id uuid not null references public.license_codes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid references public.image2_wallet_transactions(id) on delete set null,
  credit_amount integer not null check (credit_amount > 0),
  created_at timestamptz not null default now(),
  unique (license_code_id, user_id)
);

drop trigger if exists image2_wallets_set_updated_at on public.image2_wallets;
create trigger image2_wallets_set_updated_at
  before update on public.image2_wallets
  for each row execute function public.image2_set_updated_at();

create index if not exists image2_wallet_transactions_user_created_idx
  on public.image2_wallet_transactions(user_id, created_at desc);
create index if not exists image2_wallet_transactions_source_idx
  on public.image2_wallet_transactions(source, source_id);
create index if not exists image2_wallet_redemptions_user_created_idx
  on public.image2_wallet_redemptions(user_id, created_at desc);

alter table public.image2_wallets enable row level security;
alter table public.image2_wallet_transactions enable row level security;
alter table public.image2_wallet_redemptions enable row level security;

drop policy if exists image2_wallets_select_own on public.image2_wallets;
create policy image2_wallets_select_own
  on public.image2_wallets for select to authenticated
  using (user_id = auth.uid());

drop policy if exists image2_wallet_transactions_select_own on public.image2_wallet_transactions;
create policy image2_wallet_transactions_select_own
  on public.image2_wallet_transactions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists image2_wallet_redemptions_select_own on public.image2_wallet_redemptions;
create policy image2_wallet_redemptions_select_own
  on public.image2_wallet_redemptions for select to authenticated
  using (user_id = auth.uid());

create or replace function public.image2_credit_amount_for_plan(p_plan text, p_metadata jsonb default '{}'::jsonb)
returns integer
language plpgsql
immutable
as $$
declare
  v_credits integer;
begin
  if p_metadata ? 'credits' then
    begin
      v_credits := (p_metadata->>'credits')::integer;
      if v_credits > 0 then
        return v_credits;
      end if;
    exception when others then
      v_credits := null;
    end;
  end if;

  return case lower(coalesce(p_plan, ''))
    when 'image2_credits_10' then 10
    when 'image2_credit_10' then 10
    when 'image2_pack_10' then 10
    when 'image2_credits_50' then 50
    when 'image2_credit_50' then 50
    when 'image2_pack_50' then 50
    when 'image2_credits_100' then 100
    when 'image2_credit_100' then 100
    when 'image2_pack_100' then 100
    else 0
  end;
end;
$$;

create or replace function public.image2_apply_wallet_delta(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_source text default null,
  p_source_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.image2_wallets%rowtype;
  v_transaction public.image2_wallet_transactions%rowtype;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if p_amount = 0 then
    return jsonb_build_object('ok', false, 'reason', 'zero_amount');
  end if;

  if p_type not in ('redeem', 'spend', 'refund', 'admin', 'adjustment') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_type');
  end if;

  insert into public.image2_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from public.image2_wallets
  where user_id = p_user_id
  for update;

  if v_wallet.balance + p_amount < 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_balance',
      'wallet', jsonb_build_object(
        'balance', v_wallet.balance,
        'lifetimeCredited', v_wallet.lifetime_credited,
        'lifetimeSpent', v_wallet.lifetime_spent
      )
    );
  end if;

  update public.image2_wallets
  set balance = balance + p_amount,
      lifetime_credited = lifetime_credited + greatest(p_amount, 0),
      lifetime_spent = lifetime_spent + case when p_amount < 0 then abs(p_amount) else 0 end
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.image2_wallet_transactions (
    user_id,
    amount,
    balance_after,
    type,
    source,
    source_id,
    metadata
  )
  values (
    p_user_id,
    p_amount,
    v_wallet.balance,
    p_type,
    p_source,
    p_source_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_transaction;

  return jsonb_build_object(
    'ok', true,
    'transactionId', v_transaction.id,
    'wallet', jsonb_build_object(
      'balance', v_wallet.balance,
      'lifetimeCredited', v_wallet.lifetime_credited,
      'lifetimeSpent', v_wallet.lifetime_spent,
      'updatedAt', v_wallet.updated_at
    )
  );
end;
$$;

create or replace function public.image2_redeem_balance_code(
  p_user_id uuid,
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
  v_license public.license_codes%rowtype;
  v_now timestamptz := now();
  v_credits integer;
  v_apply jsonb;
  v_transaction_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select *
  into v_license
  from public.license_codes
  where code_hash = p_code_hash
  for update;

  if not found then
    insert into public.license_redemptions (user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (p_user_id, p_code_hash, 'invalid', 'license_not_found', p_ip_hash, left(coalesce(p_user_agent, ''), 500));
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if v_license.plan = 'weekly_free' then
    return jsonb_build_object('ok', false, 'reason', 'legacy_weekly_free');
  end if;

  if exists (
    select 1
    from public.image2_wallet_redemptions
    where license_code_id = v_license.id
      and user_id = p_user_id
  ) then
    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, p_user_id, p_code_hash, 'duplicate', 'already_redeemed_by_user', p_ip_hash, left(coalesce(p_user_agent, ''), 500));
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  if v_license.status = 'disabled' then
    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, p_user_id, p_code_hash, 'disabled', coalesce(v_license.disabled_reason, 'license_disabled'), p_ip_hash, left(coalesce(p_user_agent, ''), 500));
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;

  if v_license.status = 'expired' or (v_license.expires_at is not null and v_license.expires_at <= v_now) then
    update public.license_codes
    set status = 'expired'
    where id = v_license.id and status = 'active';

    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, p_user_id, p_code_hash, 'expired', 'license_expired', p_ip_hash, left(coalesce(p_user_agent, ''), 500));
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if v_license.status = 'used' or v_license.redeemed_count >= v_license.max_redemptions then
    update public.license_codes
    set status = 'used'
    where id = v_license.id and status = 'active';

    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, p_user_id, p_code_hash, 'exhausted', 'license_exhausted', p_ip_hash, left(coalesce(p_user_agent, ''), 500));
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  if v_license.status <> 'active' then
    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, p_user_id, p_code_hash, 'failed', 'license_not_active', p_ip_hash, left(coalesce(p_user_agent, ''), 500));
    return jsonb_build_object('ok', false, 'reason', 'license_not_active');
  end if;

  v_credits := public.image2_credit_amount_for_plan(v_license.plan, v_license.metadata);
  if v_credits <= 0 then
    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, p_user_id, p_code_hash, 'failed', 'unsupported_credit_plan', p_ip_hash, left(coalesce(p_user_agent, ''), 500));
    return jsonb_build_object('ok', false, 'reason', 'unsupported_credit_plan', 'plan', v_license.plan);
  end if;

  update public.license_codes
  set redeemed_count = redeemed_count + 1,
      status = case
        when redeemed_count + 1 >= max_redemptions then 'used'
        else status
      end
  where id = v_license.id;

  v_apply := public.image2_apply_wallet_delta(
    p_user_id,
    v_credits,
    'redeem',
    'license_code',
    v_license.id,
    jsonb_build_object('plan', v_license.plan, 'credits', v_credits)
  );

  if coalesce((v_apply->>'ok')::boolean, false) is false then
    insert into public.license_redemptions (license_code_id, user_id, request_hash, result, failure_reason, ip_hash, user_agent)
    values (v_license.id, p_user_id, p_code_hash, 'failed', coalesce(v_apply->>'reason', 'wallet_credit_failed'), p_ip_hash, left(coalesce(p_user_agent, ''), 500));
    return v_apply;
  end if;

  v_transaction_id := (v_apply->>'transactionId')::uuid;

  insert into public.image2_wallet_redemptions (
    license_code_id,
    user_id,
    transaction_id,
    credit_amount
  )
  values (
    v_license.id,
    p_user_id,
    v_transaction_id,
    v_credits
  );

  insert into public.license_redemptions (license_code_id, user_id, request_hash, result, ip_hash, user_agent)
  values (v_license.id, p_user_id, p_code_hash, 'succeeded', p_ip_hash, left(coalesce(p_user_agent, ''), 500));

  return jsonb_build_object(
    'ok', true,
    'redemption', jsonb_build_object(
      'plan', v_license.plan,
      'credits', v_credits,
      'transactionId', v_transaction_id
    ),
    'wallet', v_apply->'wallet'
  );
end;
$$;

revoke all on function public.image2_credit_amount_for_plan(text, jsonb) from public;
revoke all on function public.image2_apply_wallet_delta(uuid, integer, text, text, uuid, jsonb) from public;
revoke all on function public.image2_redeem_balance_code(uuid, text, text, text) from public;

grant execute on function public.image2_credit_amount_for_plan(text, jsonb) to authenticated, service_role;
grant execute on function public.image2_apply_wallet_delta(uuid, integer, text, text, uuid, jsonb) to service_role;
grant execute on function public.image2_redeem_balance_code(uuid, text, text, text) to service_role;

comment on table public.image2_wallets is 'Image2 paid image generation balance by user.';
comment on table public.image2_wallet_transactions is 'Audited Image2 balance changes. Positive amounts credit, negative amounts spend.';
comment on table public.image2_wallet_redemptions is 'Image2 paid card-code redemptions into wallet balance.';

select pg_notify('pgrst', 'reload schema');
