begin;

-- =========================================================
-- START_PERSONAL_INITIAL_DRAFT - self-service Initial Draft start
-- (Season 1 mandatory onboarding, item 6 of the launch-flow directive)
--
-- WHY
-- src/app/actions/draft.ts's startInitialDraft() and
-- src/app/actions/profile.ts's chooseBossMonster() both already call
-- supabase.rpc("start_personal_initial_draft", { target_league_id })
-- and both simply redirect to /draft afterwards - but no migration
-- ever defined this function. It does not exist in the database.
-- Calling it today raises a Postgres "function does not exist"
-- error. This is the one missing piece the mandatory onboarding
-- flow's "START DRAFT" step depends on: the existing
-- public.start_initial_draft(league_id, name, participant_ids) is
-- ADMIN-GATED ("Only league admins can start a draft") and built for
-- an admin manually kicking off a shared draft for up to 3 named
-- participants - a brand new player has no way to start their OWN
-- draft with it.
--
-- This function is the self-service counterpart the client code
-- already assumes exists: any league member can call it for
-- themselves, no admin required, exactly one participant (the
-- caller). It is built directly on start_initial_draft's own insert
-- pattern (202608190006_draft_fusion_phase.sql's redefinition, the
-- latest one - same settings keys, same drafts/draft_players column
-- set) so the rest of the draft engine (create_next_draft_offer,
-- pick_draft_card, and every rarity/exclusion rule inside them) is
-- reused completely untouched, per the explicit instruction to use
-- the existing draft system rather than rebuild it.
--
-- The two guard checks mirror startInitialDraft()'s own comment
-- header in draft.ts, which already documents the intended
-- protections for a function of this exact name ("De Initial Draft
-- is eenmalig" / the Initial Draft is one-time - "geen tweede
-- actieve draft" / no second active draft, "geen tweede afgeronde
-- Initial Draft" / no second completed Initial Draft) - that
-- comment was clearly written against this function's intended
-- behavior, so it is implemented here rather than guessed.
--
-- WHAT THIS CHANGES
-- Adds exactly one new function, start_personal_initial_draft(uuid).
-- Does not touch start_initial_draft, create_next_draft_offer,
-- pick_draft_card, or any table/column - purely additive.
--
-- SAFETY
-- - security definer + set search_path = '', same convention as
--   every other RPC in this file family, so it runs with consistent
--   privileges regardless of caller role.
-- - Every insert target (public.drafts, public.draft_players) and
--   every column written is identical to the already-live, already-
--   used start_initial_draft - no new table shape, no new column.
-- - Fully reversible: `drop function if exists
--   public.start_personal_initial_draft(uuid);` undoes this
--   migration with no data-shape consequences.
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

  -- De Initial Draft is eenmalig - block a second active OR a
  -- second completed personal Initial Draft for this player.
  if exists (
    select 1
    from public.draft_players
    where profile_id = current_user_id
      and status = 'drafting'
  ) then
    raise exception 'You already have an Initial Draft in progress.';
  end if;

  if exists (
    select 1
    from public.draft_players
    where profile_id = current_user_id
      and status = 'completed'
  ) then
    raise exception 'You have already completed your Initial Draft.';
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
  'Self-service counterpart to admin-gated start_initial_draft(): starts a solo Initial Draft (60 Main / 2 Fusion / 2 XYZ, per-league settings) for the calling player only. One-time per player - blocks a second active or second completed attempt. Already called by src/app/actions/draft.ts (startInitialDraft) and src/app/actions/profile.ts (chooseBossMonster), which existed before this function did.';

revoke all on function public.start_personal_initial_draft(uuid) from public;
grant execute on function public.start_personal_initial_draft(uuid) to authenticated;

commit;
