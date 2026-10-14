begin;

-- =========================================================
-- Initial Draft: one time per player, Boss Route first
-- (2026-10-15, code-review M4 + browser-test finding)
--
-- Business rule (CLAUDE.md): the Initial Draft is one-time per
-- player; a player who joins later still gets their own one.
--
-- 1. start_personal_initial_draft
--    * refuses when the player has ANY draft_players row in a draft
--      that was not cancelled (before: only 'drafting' / 'completed'
--      counted, so a 'waiting' seat from an admin-started draft let
--      a second one start);
--    * takes a per-player advisory lock, so two taps / two phones at
--      the same moment cannot both pass the check;
--    * requires the Boss Route (player_boss_paths route_slot 1)
--      first - /draft is reachable during onboarding, and the
--      onboarding order is Boss Route -> Initial Draft.
-- 2. start_initial_draft (the admin tool) refuses a participant who
--    already has an Initial Draft (same rule, same lock).
--
-- A season reset deletes every draft, so every player gets a new
-- one-time draft in the next season, as before. No signature
-- changes; backwards compatible with the live main app (its
-- onboarding already sends players to Boss Path select first).
-- =========================================================

create or replace function public.start_personal_initial_draft(
  target_league_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  new_draft_id uuid;
  draft_name text;

  configured_main integer := 60;
  configured_fusion integer := 2;
  configured_xyz integer := 2;
  configured_options integer := 3;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.league_members
    where league_id = target_league_id
      and profile_id = current_user_id
  ) then
    raise exception 'You are not a member of this league.';
  end if;

  -- Two taps / two phones at once: the second waits here and then
  -- sees the first one's draft below.
  perform pg_advisory_xact_lock(hashtext('initial_draft_' || current_user_id::text));

  -- The Initial Draft is one-time: any seat in a draft that was not
  -- cancelled (waiting, drafting or completed) counts.
  if exists (
    select 1
    from public.draft_players dp
    join public.drafts d
      on d.id = dp.draft_id
    where dp.profile_id = current_user_id
      and d.status <> 'cancelled'
      and dp.status = 'completed'
  ) then
    raise exception 'You have already completed your Initial Draft.';
  end if;

  if exists (
    select 1
    from public.draft_players dp
    join public.drafts d
      on d.id = dp.draft_id
    where dp.profile_id = current_user_id
      and d.status <> 'cancelled'
  ) then
    raise exception 'You already have an Initial Draft in progress.';
  end if;

  -- Onboarding order: Boss Route first, then the Initial Draft.
  if not exists (
    select 1
    from public.player_boss_paths
    where profile_id = current_user_id
      and route_slot = 1
  ) then
    raise exception 'Choose your Boss Route first.';
  end if;

  select (value #>> '{}')::integer
  into configured_main
  from public.settings
  where league_id = target_league_id
    and key = 'draft.initial_main_picks';
  configured_main := coalesce(configured_main, 60);

  select (value #>> '{}')::integer
  into configured_fusion
  from public.settings
  where league_id = target_league_id
    and key = 'draft.initial_fusion_picks';
  configured_fusion := coalesce(configured_fusion, 2);

  select (value #>> '{}')::integer
  into configured_xyz
  from public.settings
  where league_id = target_league_id
    and key = 'draft.initial_xyz_picks';
  configured_xyz := coalesce(configured_xyz, 2);

  select (value #>> '{}')::integer
  into configured_options
  from public.settings
  where league_id = target_league_id
    and key = 'draft.options_per_pick';
  configured_options := coalesce(configured_options, 3);

  select coalesce(nullif(trim(duelist_name), ''), username, 'Player') || '''s Initial Draft'
  into draft_name
  from public.profiles
  where id = current_user_id;

  draft_name := coalesce(draft_name, 'Personal Initial Draft');

  insert into public.drafts (
    league_id,
    name,
    status,
    created_by,
    main_picks_per_player,
    fusion_picks_per_player,
    xyz_picks_per_player,
    options_per_pick,
    started_at
  )
  values (
    target_league_id,
    draft_name,
    'active',
    current_user_id,
    configured_main,
    configured_fusion,
    configured_xyz,
    configured_options,
    now()
  )
  returning id
  into new_draft_id;

  insert into public.draft_players (
    draft_id,
    profile_id,
    status
  )
  values (
    new_draft_id,
    current_user_id,
    'drafting'
  );

  return new_draft_id;
end;
$$;

comment on function public.start_personal_initial_draft(uuid) is
  'Self-service Initial Draft (60 Main / 2 Fusion / 2 XYZ, per-league settings) for the calling player only. Needs the Boss Route (slot 1) first. One-time per player: refused while the player has any seat in a non-cancelled draft (202610152040).';

revoke all on function public.start_personal_initial_draft(uuid) from public, anon;
grant execute on function public.start_personal_initial_draft(uuid) to authenticated;

-- ---------------------------------------------------------
-- start_initial_draft (admin): same one-time rule, patched in after
-- the first "begin" (body otherwise unchanged).
-- ---------------------------------------------------------

do $$
declare
  def text;
  patched text;
  marker constant text := 'one-time initial draft guard (202610152040)';
begin
  def := pg_get_functiondef('public.start_initial_draft(uuid,text,uuid[])'::regprocedure);

  if position(marker in def) > 0 then
    return;
  end if;

  patched := regexp_replace(
    def,
    E'\\nbegin\\n',
    E'\nbegin\n  -- ' || marker || E'\n'
      || E'  perform pg_advisory_xact_lock(hashtext(''initial_draft_'' || p::text)) from unnest(participant_ids) as p;\n'
      || E'  if exists (select 1 from public.draft_players dp join public.drafts d on d.id = dp.draft_id where dp.profile_id = any (participant_ids) and d.status <> ''cancelled'') then\n'
      || E'    raise exception ''A player in this draft already had their one-time Initial Draft.'';\n'
      || E'  end if;\n'
  );

  if patched = def then
    raise exception 'initial draft guards: could not patch start_initial_draft';
  end if;

  execute patched;
end;
$$;

commit;
