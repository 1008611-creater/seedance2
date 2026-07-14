-- Minimal role-bound administrator profile contract for Image2.
-- This migration intentionally does not create the broader account/assets schema.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default 'Creator',
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('user', 'admin'))
);

create index if not exists profiles_role_idx on public.profiles(role);

create or replace function public.image2_profiles_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.image2_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Creator'
    )
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$function$;

revoke all on function public.image2_profiles_set_updated_at() from public, anon, authenticated;
revoke all on function public.image2_handle_new_user() from public, anon, authenticated;

drop trigger if exists image2_profiles_set_updated_at on public.profiles;
create trigger image2_profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.image2_profiles_set_updated_at();

drop trigger if exists image2_profile_on_auth_user_created on auth.users;
create trigger image2_profile_on_auth_user_created
  after insert on auth.users
  for each row execute function public.image2_handle_new_user();

insert into public.profiles (id, email, display_name)
select
  users.id,
  users.email,
  coalesce(
    nullif(btrim(coalesce(users.raw_user_meta_data ->> 'display_name', '')), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'Creator'
  )
from auth.users as users
on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own_display_name on public.profiles;
create policy profiles_update_own_display_name
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

-- Promote exactly the confirmed owner account. STRICT prevents a missing or
-- ambiguous Auth match from silently creating an unintended administrator.
do $block$
declare
  owner_user_id uuid;
  admin_count bigint;
begin
  select id
  into strict owner_user_id
  from auth.users
  where lower(email) = lower('1453637677@qq.com')
    and email_confirmed_at is not null;

  update public.profiles
  set role = 'admin',
      updated_at = now()
  where id = owner_user_id;

  if not found then
    raise exception 'Confirmed owner profile was not created';
  end if;

  select count(*) into admin_count
  from public.profiles
  where role = 'admin';

  if admin_count <> 1 then
    raise exception 'Expected exactly one administrator, found %', admin_count;
  end if;
end;
$block$;

comment on table public.profiles is
  'Minimal Image2 account profile and server-verified role contract. Authentication secrets are never stored here.';
comment on column public.profiles.role is
  'Server-managed authorization role. Authenticated browser clients have no UPDATE privilege on this column.';

select pg_notify('pgrst', 'reload schema');

commit;
