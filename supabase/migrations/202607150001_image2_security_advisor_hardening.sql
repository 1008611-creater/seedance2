-- Image2 Security Advisor hardening.
-- Safe to rerun. This migration does not delete or rewrite user, wallet,
-- entitlement, redemption, case, or generation data.

-- Trigger/helper functions should use an explicit search path so an attacker
-- cannot influence unqualified object resolution.
do $hardening$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    alter function public.set_updated_at() set search_path = pg_catalog, public;
  end if;
  if to_regprocedure('public.seedance_set_updated_at()') is not null then
    alter function public.seedance_set_updated_at() set search_path = pg_catalog, public;
  end if;
  if to_regprocedure('public.image2_set_updated_at()') is not null then
    alter function public.image2_set_updated_at() set search_path = pg_catalog, public;
  end if;
  if to_regprocedure('public.image2_gacha_set_updated_at()') is not null then
    alter function public.image2_gacha_set_updated_at() set search_path = pg_catalog, public;
  end if;
  if to_regprocedure('public.image2_credit_amount_for_plan(text,jsonb)') is not null then
    alter function public.image2_credit_amount_for_plan(text, jsonb) set search_path = pg_catalog, public;
  end if;
end
$hardening$;

-- These SECURITY DEFINER wallet mutation functions are server-internal RPCs.
-- PostgREST calls them only with the server-side service role key.
revoke all on function public.image2_apply_wallet_delta(uuid, integer, text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.image2_redeem_balance_code(uuid, text, text, text)
  from public, anon, authenticated;

grant execute on function public.image2_apply_wallet_delta(uuid, integer, text, text, uuid, jsonb)
  to service_role;
grant execute on function public.image2_redeem_balance_code(uuid, text, text, text)
  to service_role;

select pg_notify('pgrst', 'reload schema');
