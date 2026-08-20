begin;

create extension if not exists pgcrypto;

do $$ begin
  create type public.league_role as enum ('admin', 'player');
exception when duplicate_object then null;
end $$;

create table if not exists public.boss_monster_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  subtitle text,
  external_card_id bigint,
  image_url text,
  gameplay_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint boss_name_not_blank check (length(trim(name)) > 0)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  duelist_name text not null,
  avatar_url text,
  custom_title text,
  catchphrase text,
  bio text,
  favorite_play_style text,
  favorite_card_type text,
  favorite_attribute text,
  favorite_monster_type text,
  boss_monster_option_id uuid references public.boss_monster_options(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_-]{3,24}$'),
  constraint duelist_name_length check (char_length(duelist_name) between 2 and 32)
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint league_slug_format check (slug ~ '^[a-z0-9-]{3,40}$')
);

create table if not exists public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.league_role not null default 'player',
  joined_at timestamptz not null default now(),
  primary key (league_id, profile_id)
);

create index if not exists league_members_profile_idx on public.league_members(profile_id);

create table if not exists public.wallets (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  duel_points bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint wallets_nonnegative_dp check (duel_points >= 0)
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  key text not null,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, key),
  constraint settings_key_not_blank check (length(trim(key)) > 0)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  league_id uuid references public.leagues(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint audit_action_not_blank check (length(trim(action)) > 0)
);

create index if not exists audit_log_league_created_idx on public.audit_log(league_id, created_at desc);
create index if not exists audit_log_actor_created_idx on public.audit_log(actor_id, created_at desc);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_username text;
begin
  raw_username := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  if raw_username !~ '^[a-z0-9_-]{3,24}$' then
    raise exception 'invalid username';
  end if;

  insert into public.profiles (id, username, duelist_name)
  values (
    new.id,
    raw_username,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'duelist_name', ''), raw_username), 32)
  );

  insert into public.wallets(profile_id, duel_points) values (new.id, 0);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.is_league_member(target_league uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members lm
    where lm.league_id = target_league
      and lm.profile_id = (select auth.uid())
  );
$$;

create or replace function public.is_league_admin(target_league uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members lm
    where lm.league_id = target_league
      and lm.profile_id = (select auth.uid())
      and lm.role = 'admin'
  );
$$;


create or replace function public.bootstrap_private_league()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target_league uuid;
begin
  if uid is null then
    raise exception 'authentication required';
  end if;

  -- Serializes the tiny private-league bootstrap so the first accounts
  -- cannot accidentally create multiple leagues concurrently.
  perform pg_advisory_xact_lock(9463021);

  select lm.league_id into target_league
  from public.league_members lm
  where lm.profile_id = uid
  limit 1;

  if target_league is not null then
    return target_league;
  end if;

  select l.id into target_league
  from public.leagues l
  where l.archived_at is null
  order by l.created_at
  limit 1;

  if target_league is null then
    insert into public.leagues(name, slug, created_by)
    values ('Friends League', 'friends-league', uid)
    returning id into target_league;

    insert into public.league_members(league_id, profile_id, role)
    values (target_league, uid, 'admin');

    insert into public.settings(league_id, key, value, description, updated_by)
    values
      (target_league, 'economy.match_win_dp', '100'::jsonb, 'DP reward for a match win', uid),
      (target_league, 'economy.match_loss_dp', '35'::jsonb, 'DP reward for a match loss', uid),
      (target_league, 'competition.cp_by_position', '[5,3,1]'::jsonb, 'Round CP by finishing position', uid),
      (target_league, 'life_points.start', '8000'::jsonb, 'Starting LP', uid),
      (target_league, 'shop.refresh_hours', '72'::jsonb, 'Shop rotation interval', uid),
      (target_league, 'trading.window_enabled', 'false'::jsonb, 'Whether transfers may settle', uid),
      (target_league, 'draft.entry_price_dp', '0'::jsonb, 'Default draft entry price', uid),
      (target_league, 'achievements.default_reward_dp', '0'::jsonb, 'Fallback achievement DP reward', uid),
      (target_league, 'decks.main_min', '40'::jsonb, 'Minimum main deck cards', uid),
      (target_league, 'decks.main_max', '60'::jsonb, 'Maximum main deck cards', uid),
      (target_league, 'decks.extra_max', '15'::jsonb, 'Maximum extra deck cards', uid),
      (target_league, 'decks.side_max', '15'::jsonb, 'Maximum side deck cards', uid);
  else
    if (select count(*) from public.league_members lm where lm.league_id = target_league) >= 3 then
      raise exception 'private league is full';
    end if;

    insert into public.league_members(league_id, profile_id, role)
    values (target_league, uid, 'player');
  end if;

  return target_league;
end;
$$;

grant execute on function public.bootstrap_private_league() to authenticated;

create or replace function public.audit_setting_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log(league_id, actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    coalesce(new.league_id, old.league_id),
    (select auth.uid()),
    case when tg_op = 'INSERT' then 'setting.created' else 'setting.updated' end,
    'setting',
    coalesce(new.id, old.id)::text,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists settings_audit on public.settings;
create trigger settings_audit
  after insert or update on public.settings
  for each row execute function public.audit_setting_change();

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.boss_monster_options enable row level security;
alter table public.wallets enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists leagues_select_member on public.leagues;
create policy leagues_select_member on public.leagues
  for select to authenticated using (public.is_league_member(id));

drop policy if exists leagues_insert_authenticated on public.leagues;
create policy leagues_insert_authenticated on public.leagues
  for insert to authenticated with check ((select auth.uid()) = created_by);

drop policy if exists leagues_update_admin on public.leagues;
create policy leagues_update_admin on public.leagues
  for update to authenticated using (public.is_league_admin(id)) with check (public.is_league_admin(id));

drop policy if exists league_members_select_member on public.league_members;
create policy league_members_select_member on public.league_members
  for select to authenticated using (public.is_league_member(league_id));

drop policy if exists league_members_insert_admin on public.league_members;
create policy league_members_insert_admin on public.league_members
  for insert to authenticated with check (public.is_league_admin(league_id));

drop policy if exists league_members_update_admin on public.league_members;
create policy league_members_update_admin on public.league_members
  for update to authenticated using (public.is_league_admin(league_id)) with check (public.is_league_admin(league_id));

drop policy if exists league_members_delete_admin on public.league_members;
create policy league_members_delete_admin on public.league_members
  for delete to authenticated using (public.is_league_admin(league_id));

drop policy if exists boss_options_select_authenticated on public.boss_monster_options;
create policy boss_options_select_authenticated on public.boss_monster_options
  for select to authenticated using (active or exists (
    select 1 from public.league_members lm
    where lm.profile_id = (select auth.uid()) and lm.role = 'admin'
  ));

drop policy if exists boss_options_admin_all on public.boss_monster_options;
create policy boss_options_admin_all on public.boss_monster_options
  for all to authenticated
  using (exists (select 1 from public.league_members lm where lm.profile_id = (select auth.uid()) and lm.role = 'admin'))
  with check (exists (select 1 from public.league_members lm where lm.profile_id = (select auth.uid()) and lm.role = 'admin'));

drop policy if exists wallets_select_self on public.wallets;
create policy wallets_select_self on public.wallets
  for select to authenticated using ((select auth.uid()) = profile_id);

-- No direct client-side wallet writes in Phase 1.
revoke insert, update, delete on public.wallets from authenticated;

drop policy if exists settings_select_member on public.settings;
create policy settings_select_member on public.settings
  for select to authenticated using (public.is_league_member(league_id));

drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings
  for all to authenticated
  using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

drop policy if exists audit_select_admin on public.audit_log;
create policy audit_select_admin on public.audit_log
  for select to authenticated using (league_id is not null and public.is_league_admin(league_id));

revoke insert, update, delete on public.audit_log from anon, authenticated;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.leagues to authenticated;
grant select, insert, update, delete on public.league_members to authenticated;
grant select, insert, update, delete on public.boss_monster_options to authenticated;
grant select on public.wallets to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant select on public.audit_log to authenticated;

commit;
