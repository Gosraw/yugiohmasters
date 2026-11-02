-- =========================================================
-- PASTE THIS WHOLE FILE INTO THE SUPABASE SQL EDITOR, THEN PRESS RUN.
--
-- Puts the player bossg back at the start of Season 2: wheel, Initial
-- Draft, welcome packs. Unlike 20261102_reset_bossg_onboarding.sql this
-- also removes an Initial Draft, finished or not - a one-off exception
-- the owner asked for on 2026-11-02. Other players are not touched. The
-- account, password, admin role and card votes stay.
--
-- One transaction: if anything goes wrong, nothing changes. It refuses
-- to run if bossg has already gone beyond the draft (deck, pack opened,
-- purchase, duel, trade, competition), because this file only covers
-- what the wheel, the draft and the welcome bonus create. Safe to run
-- twice.
--
-- The result is one row. checks_passed must say true.
-- =========================================================

begin;

do $reset$
declare
  v_player uuid;
  v_blockers text;
begin
  select id
  into v_player
  from public.profiles
  where username = 'bossg';

  if v_player is null then
    raise exception 'Reset aborted: player bossg not found. Nothing changed.';
  end if;

  select string_agg(blocker, ', ')
  into v_blockers
  from (
    select 'deck' as blocker where exists (select 1 from public.decks where owner_id = v_player)
    union all
    select 'pack opened' where exists (select 1 from public.shop_pack_openings where profile_id = v_player)
    union all
    select 'shop purchase' where exists (select 1 from public.shop_purchases where profile_id = v_player)
    union all
    select 'duel' where exists (select 1 from public.matches where player_one_id = v_player or player_two_id = v_player)
    union all
    select 'trade' where exists (select 1 from public.trades where sender_id = v_player or receiver_id = v_player)
    union all
    select 'competition' where exists (select 1 from public.competition_players where profile_id = v_player)
    union all
    select 'DP movement' where exists (select 1 from public.duel_point_transactions where profile_id = v_player)
    union all
    select 'card from elsewhere' where exists (
      select 1
      from public.card_instances
      where (current_owner_id = v_player or original_owner_id = v_player)
        and (
          current_owner_id <> v_player
          or original_owner_id <> v_player
          or original_acquisition_type not in ('achievement', 'draft')
        )
    )
    union all
    select 'draft shared with another player' where exists (
      select 1
      from public.draft_players mine
      join public.draft_players other
        on other.draft_id = mine.draft_id
       and other.profile_id <> v_player
      where mine.profile_id = v_player
    )
  ) blockers;

  if v_blockers is not null then
    raise exception 'Reset aborted: bossg already has: %. Nothing changed - ask Claude.', v_blockers;
  end if;

  -- The Initial Draft: picks first, they point at the offers and cards.
  create temp table reset_drafts on commit drop as
  select id as draft_player_id, draft_id
  from public.draft_players
  where profile_id = v_player;

  delete from public.draft_picks
  where draft_player_id in (select draft_player_id from reset_drafts);

  delete from public.draft_offer_cards
  where offer_id in (
    select id
    from public.draft_offers
    where draft_player_id in (select draft_player_id from reset_drafts)
  );

  delete from public.draft_offers
  where draft_player_id in (select draft_player_id from reset_drafts);

  delete from public.draft_players
  where id in (select draft_player_id from reset_drafts);

  delete from public.drafts
  where id in (select draft_id from reset_drafts);

  -- The drafted cards and the Boss Path cards. The delete guard on
  -- card_instances is the deliberate scarcity rule, so it is switched
  -- off only here, inside this transaction.
  delete from public.ownership_history
  where from_owner_id = v_player
     or to_owner_id = v_player;

  alter table public.card_instances disable trigger prevent_card_instance_delete_trigger;

  delete from public.card_instances
  where current_owner_id = v_player;

  alter table public.card_instances enable trigger prevent_card_instance_delete_trigger;

  delete from public.player_boss_stage_unlocks
  where player_boss_path_id in (
    select id
    from public.player_boss_paths
    where profile_id = v_player
  );

  delete from public.player_boss_achievement_events
  where player_boss_path_id in (
    select id
    from public.player_boss_paths
    where profile_id = v_player
  );

  delete from public.player_boss_paths
  where profile_id = v_player;

  -- The welcome bonus, so it is granted again after the new start.
  delete from public.reward_vouchers
  where profile_id = v_player;

  delete from public.season1_welcome_bonus_claims
  where profile_id = v_player;

  -- Progress counters, in case anything was already counted.
  delete from public.weekly_goal_bonus_grants where profile_id = v_player;
  delete from public.weekly_goal_progress where profile_id = v_player;
  delete from public.season_path_tier_grants where profile_id = v_player;
  delete from public.season_path_xp_events where profile_id = v_player;
  delete from public.player_pack_luck where profile_id = v_player;
end;
$reset$;

commit;

-- =========================================================
-- VERIFICATION (reads only)
-- =========================================================

with p as (
  select id
  from public.profiles
  where username = 'bossg'
),
counts as (
  select
    (select count(*) from public.player_boss_paths b, p where b.profile_id = p.id) as boss_paths,
    (select count(*) from public.draft_players d, p where d.profile_id = p.id) as drafts,
    (select count(*) from public.card_instances c, p where c.current_owner_id = p.id) as cards,
    (select count(*) from public.reward_vouchers v, p where v.profile_id = p.id) as vouchers,
    (select count(*) from public.season1_welcome_bonus_claims w, p where w.profile_id = p.id) as welcome_claims,
    (select role from public.league_members m, p where m.profile_id = p.id) as league_role,
    (select tgenabled from pg_trigger where tgname = 'prevent_card_instance_delete_trigger') as delete_guard
)
select
  boss_paths,
  drafts,
  cards,
  vouchers,
  welcome_claims,
  league_role,
  (
    boss_paths = 0
    and drafts = 0
    and cards = 0
    and vouchers = 0
    and welcome_claims = 0
    and league_role = 'admin'
    and delete_guard = 'O'
  ) as checks_passed
from counts;
