-- =========================================================
-- PRODUCTION DRIFT NORMALIZE (generated once, 2026-11-01, from a
-- read-only copy of production compared with a replay of every
-- migration before 202610120100).
--
-- WHY
-- Production's Season 1 database was kept by hand and has no migration
-- history. Its shape differs from what supabase/migrations/* builds, so
-- the 2.0 chain cannot run on it as is (first failure: 202610120120,
-- "cannot change return type" on distribute_competition_rewards_v2).
-- This file puts production exactly where the 2.0 chain expects it, so
-- the chain then does the same thing there as in every test.
--
-- It only runs on the old hand-made shape, recognised by the old
-- seasons table (seasons.league_id). The devstack replay does not have
-- that table, and a second run on production no longer has it, so in
-- both cases this file changes nothing. Everything is one DO block, so
-- it is all or nothing.
--
-- Player data in the changed tables is kept; only legacy columns and
-- three unused hand-made tables go. The launch backup still has them.
-- Run on launch night only, directly before the 2.0 chain.
-- =========================================================

do $normalize$
declare
  v_seasons bigint;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'seasons'
      and column_name = 'league_id'
  ) then
    raise notice 'prod drift normalize: not the old hand-made shape, nothing to do.';
    return;
  end if;

  execute 'select count(*) from public.seasons' into v_seasons;

  if v_seasons > 0 then
    raise exception 'prod drift normalize: the old seasons table has % row(s), expected none. Nothing changed.', v_seasons;
  end if;

  execute $drift$
-- ---------------------------------------------------------
-- 1. Hand-made Season 1 objects the app and the tests never use
-- ---------------------------------------------------------

-- Old competition / shop functions. The 2.0 app only uses the _v2
-- competition RPCs and the newer shop rotation functions.
drop function if exists public.add_competition_player(target_competition_id uuid, target_profile_id uuid);
drop function if exists public.choose_shop_special_theme();
drop function if exists public.create_competition(target_league_id uuid, target_name text, target_type text, target_season_id uuid);
drop function if exists public.distribute_competition_rewards(target_competition_id uuid);
drop function if exists public.finalize_round_robin_competition(target_competition_id uuid);
drop function if exists public.generate_round_robin_matches(target_competition_id uuid);
drop function if exists public.generate_shop_rotation();
drop function if exists public.get_competition_standings(target_competition_id uuid);
drop function if exists public.install_default_competition_rewards(target_competition_id uuid);
drop function if exists public.pick_shop_rotation_card(target_rotation_id uuid, target_rarity text);
drop function if exists public.remove_competition_player(target_competition_id uuid, target_profile_id uuid);
drop function if exists public.roll_shop_rotation_rarity(target_slot_tier text);
drop function if exists public.start_competition(target_competition_id uuid);

-- purchase_shop_pack (section 5) no longer reads forced_next_pack_card.
drop table if exists public._admin_function_backups;
drop table if exists public.next_pack_overrides;
drop table if exists public.forced_next_pack_card;

-- ---------------------------------------------------------
-- 2. competitions and its hand-made seasons table
-- ---------------------------------------------------------

drop index if exists public.competitions_season_idx;
drop index if exists public.competitions_status_idx;
drop policy if exists "league members can read competitions" on public.competitions;

alter table public.competitions
  drop constraint if exists competitions_check,
  drop constraint if exists competitions_season_id_fkey,
  drop constraint if exists competitions_competition_type_check,
  drop constraint if exists competitions_created_by_fkey,
  drop constraint if exists competitions_league_id_fkey;

alter table public.competitions
  drop column if exists season_id,
  drop column if exists ends_at,
  alter column created_by drop not null,
  add constraint competitions_type_check
    check (competition_type = any (array['round_robin'::text, 'tournament'::text])),
  add constraint competitions_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete restrict,
  add constraint competitions_league_id_fkey
    foreign key (league_id) references public.leagues(id) on delete restrict;

-- The old shape, with no rows. 202610120800 creates the real one.
drop table public.seasons;

drop index if exists public.competitions_league_idx;
create index competitions_league_idx
  on public.competitions (league_id, created_at desc);

-- ---------------------------------------------------------
-- 3. The other competition tables
-- ---------------------------------------------------------

drop index if exists public.competition_players_profile_idx;
drop policy if exists "league members can read competition players" on public.competition_players;

alter table public.competition_players
  drop constraint if exists competition_players_seed_check,
  drop column if exists seed;

alter table public.competition_players rename column joined_at to created_at;

drop index if exists public.competition_results_competition_idx;
drop policy if exists "league members can read competition results" on public.competition_results;

alter table public.competition_results
  drop constraint if exists competition_results_check,
  drop constraint if exists competition_results_placement_check,
  drop constraint if exists competition_results_competition_id_placement_key,
  drop constraint if exists competition_results_competition_id_profile_id_key,
  drop constraint if exists competition_results_pkey;

alter table public.competition_results
  drop column if exists id,
  add constraint competition_results_pkey primary key (competition_id, profile_id);

drop policy if exists "league members can read reward rules" on public.competition_reward_rules;

alter table public.competition_reward_rules
  drop constraint if exists competition_reward_rules_check,
  drop constraint if exists competition_reward_rules_competition_id_placement_key,
  drop constraint if exists competition_reward_rules_duel_points_check,
  drop constraint if exists competition_reward_rules_placement_check,
  drop constraint if exists competition_reward_rules_voucher_quantity_check,
  drop constraint if exists competition_reward_rules_voucher_type_check;

alter table public.competition_reward_rules
  drop column if exists created_at,
  add constraint competition_reward_rules_placement_check check (placement >= 1),
  add constraint competition_reward_rules_unique unique (competition_id, placement);

drop policy if exists "league members can read reward grants" on public.competition_reward_grants;

alter table public.competition_reward_grants
  drop constraint if exists competition_reward_grants_profile_id_fkey;

alter table public.competition_reward_grants
  drop column if exists duel_points,
  drop column if exists created_at,
  add constraint competition_reward_grants_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete restrict;

alter table public.competition_round_reward_rules
  drop constraint if exists competition_round_reward_rules_role_check;

alter table public.competition_round_reward_rules
  add constraint competition_round_reward_rules_role_check
    check (role = any (array['participation'::text, 'round_winner'::text, 'round_runner_up'::text, 'round_third'::text]));

alter table public.competition_round_reward_grants
  drop constraint if exists competition_round_reward_grants_reward_role_check;

alter table public.competition_round_reward_grants
  add constraint competition_round_reward_grants_reward_role_check
    check (reward_role = any (array['participation'::text, 'round_winner'::text, 'round_runner_up'::text, 'round_third'::text]));

-- The full-round economy (202609042200) never reached production: no
-- third place, and the old 250 / 150 / 75 round numbers. These are the
-- values every 2.0 test ran with; step 2b then sets the approved
-- first / second / third place numbers. Participation stays at 300.
alter table public.league_economy_defaults
  add column if not exists round_third_dp integer not null default 200,
  add constraint league_economy_defaults_round_third_dp_check check (round_third_dp >= 0);

update public.league_economy_defaults
set
  round_participation_dp = 300,
  round_first_dp = 400,
  round_second_dp = 300,
  round_third_dp = 200,
  updated_at = now()
where id = true;

-- ---------------------------------------------------------
-- 4. matches, shop tables, boss stages
-- ---------------------------------------------------------

drop index if exists public.matches_competition_idx;
drop index if exists public.matches_competition_round_idx;

alter table public.matches
  drop column if exists tournament_round,
  drop column if exists tournament_slot;

create index matches_competition_idx
  on public.matches (competition_id)
  where competition_id is not null;

create index matches_competition_round_idx
  on public.matches (competition_id, round_number)
  where competition_id is not null;

alter table public.shop_purchases
  drop constraint if exists shop_purchases_voucher_type_used_check;

drop index if exists public.shop_rotations_rotation_number_uidx;

-- rotation_number is bigint here, integer in the migrations. The view
-- reads that column, so it has to go while the type changes.
drop view public.active_shop_rotation_cards;

alter table public.shop_rotations
  drop column if exists special_pack_theme_label,
  alter column rotation_number type integer;

create view public.active_shop_rotation_cards as
SELECT sr.id AS rotation_id,
    sr.rotation_number,
    sr.starts_at,
    sr.ends_at,
    sr.special_pack_name,
    sr.special_pack_description,
    sr.special_pack_price_dp,
    sr.special_pack_cards_per_pack,
    sr.special_pack_theme_type,
    sr.special_pack_theme_value,
    sr.special_pack_theme_value AS special_pack_theme_label,
    src.id AS rotation_card_id,
    src.slot_number,
    src.slot_tier,
    src.price_dp,
    src.sold_to_profile_id,
    src.sold_at,
    cc.id AS card_catalog_id,
    cc.name AS card_name,
    cc.image_url,
    cc.card_type,
    cc.attribute,
    cc.monster_type,
    cc.archetype,
    cc.atk,
    cc.def,
    cc.game_rarity,
    cc.rarity_score
   FROM shop_rotations sr
     JOIN shop_rotation_cards src ON src.rotation_id = sr.id
     JOIN card_catalog cc ON cc.id = src.card_catalog_id
  WHERE sr.status = 'active'::text AND sr.starts_at <= now() AND sr.ends_at > now();

revoke all on public.active_shop_rotation_cards from public, anon, authenticated, service_role;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.active_shop_rotation_cards to anon;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.active_shop_rotation_cards to authenticated;
grant delete, insert, maintain, references, select, trigger, truncate, update on public.active_shop_rotation_cards to service_role;

alter table public.boss_route_stages
  drop constraint if exists boss_route_stages_route_id_evolution_card_catalog_id_key;

alter table public.boss_route_stages
  add constraint boss_route_stages_route_id_evolution_card_catalog_id_key
    unique (route_id, evolution_card_catalog_id) deferrable initially immediate;

-- ---------------------------------------------------------
-- 5. Objects from earlier migrations that production never got
-- ---------------------------------------------------------

-- 202608210017_trade_activity_view.sql
create or replace view public.trade_activity as
select
  t.id,
  t.league_id,
  t.sender_id,
  t.receiver_id,
  t.status,
  t.completed_at,
  t.created_at
from public.trades t
where
  t.status = 'accepted'
  and public.is_league_member(t.league_id);

revoke all on public.trade_activity from public;
grant select on public.trade_activity to authenticated;

-- 202608241100_dashboard_coach_insights.sql
create table if not exists public.dashboard_coach_insights (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  insight_type text not null,
  evidence jsonb not null default '{}'::jsonb,
  deterministic_summary text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  state_fingerprint text not null,
  engine_version text not null,
  ai_explanation text,
  generated_at timestamptz not null default now(),
  unique (profile_id, league_id, insight_type)
);

create index if not exists dashboard_coach_insights_profile_league_idx
  on public.dashboard_coach_insights (profile_id, league_id);

alter table public.dashboard_coach_insights enable row level security;

create policy dashboard_coach_insights_owner_select
  on public.dashboard_coach_insights for select to authenticated
  using (profile_id = auth.uid());

create policy dashboard_coach_insights_owner_insert
  on public.dashboard_coach_insights for insert to authenticated
  with check (profile_id = auth.uid());

create policy dashboard_coach_insights_owner_update
  on public.dashboard_coach_insights for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy dashboard_coach_insights_owner_delete
  on public.dashboard_coach_insights for delete to authenticated
  using (profile_id = auth.uid());

-- The Classic v2 pool was built from the 2026-10-12 YGOPRODeck data.
-- Production's older catalog knows 10 of those cards under an older
-- card id (same card, other artwork id) and misses 17 completely.
-- The 2.0 seed files match on external_card_id and would stop on these.
update public.card_catalog c
set external_card_id = v.external_card_id
from (values
  (23995348, 'Blue-Eyes Ultimate Dragon'),
  (46986420, 'Dark Magician'),
  (43892409, 'Dark Magician Girl the Dragon Knight'),
  (80193356, 'Dramatic Rescue'),
  (20366275, 'El Shaddoll Construct'),
  (4376659, 'Familiar-Possessed - Hiita'),
  (31764354, 'Familiar-Possessed - Wynn'),
  (45231178, 'Flame Swordsman'),
  (27911550, 'Parasite Paracide'),
  (74677427, 'Red-Eyes Black Dragon')
) as v(external_card_id, name)
where c.name = v.name
  and not exists (
    select 1 from public.card_catalog x
    where x.external_card_id = v.external_card_id
  );

insert into public.card_catalog (
  external_card_id, name, card_type, frame_type, monster_type, race, attribute,
  level, rank, link_rating, atk, def, description, archetype,
  image_url, image_url_small, image_url_cropped,
  release_date, release_date_source, format_eligible, format_exclusion_reason,
  master_duel_status
)
values
  (10406322, 'Alsei, the Sylvan High Protector', 'XYZ Monster', 'xyz', 'Plant / Xyz / Effect', 'Plant', 'LIGHT', null, 8, null, 2300, 3200, '2 Level 8 monsters
Once per turn: You can declare 1 card name; excavate the top card of your Deck, and if it is the declared card, add it to your hand. Otherwise, send it to the Graveyard. If a card is sent from your Deck to the Graveyard by a card effect (except during the Damage Step): You can detach 1 Xyz Material from this card, then target 1 card on the field; place that target on either the top or bottom of the Deck. You can only use this effect of "Alsei, the Sylvan High Protector" once per turn.', 'Sylvan', 'https://images.ygoprodeck.com/images/cards/10406322.jpg', 'https://images.ygoprodeck.com/images/cards_small/10406322.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/10406322.jpg', '2014-01-24'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (29223325, 'Artifact Ignition', 'Spell Card', 'spell', null, 'Quick-Play', null, null, null, null, null, null, 'Target 1 Spell/Trap Card on the field; destroy that target, and if you do, Set 1 "Artifact" monster directly from your Deck to your Spell & Trap Zone as a Spell Card. If this card in its owner''s possession is destroyed by an opponent''s card: Your opponent skips their next Battle Phase. (You must have an "Artifact" monster in your Main Deck to activate this card.)', 'Artifact', 'https://images.ygoprodeck.com/images/cards/29223325.jpg', 'https://images.ygoprodeck.com/images/cards_small/29223325.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/29223325.jpg', '2014-05-16'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (72930878, 'Black Sonic', 'Trap Card', 'trap', null, 'Normal', null, null, null, null, null, null, 'When an opponent''s monster declares an attack on a "Blackwing" monster you control: Banish all face-up Attack Position monsters your opponent controls. If you control exactly 3 "Blackwing" monsters (and no other monsters), you can activate this card from your hand.', 'Blackwing', 'https://images.ygoprodeck.com/images/cards/72930878.jpg', 'https://images.ygoprodeck.com/images/cards_small/72930878.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/72930878.jpg', '2014-04-25'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (72167543, 'Downerd Magician', 'XYZ Monster', 'xyz', 'Spellcaster / Xyz / Effect', 'Spellcaster', 'DARK', null, 4, null, 2100, 200, '2 Level 4 Spellcaster-Type monsters
During your Main Phase 2, you can also Xyz Summon this card by using a Rank 3 or lower Xyz Monster you control as the Xyz Material. (Xyz Materials attached to that monster also become Xyz Materials on this card.) This card gains 200 ATK for each Xyz Material attached to it. If this card attacks a Defense Position monster, inflict piercing battle damage to your opponent. If this card attacked or was attacked, after damage calculation: Detach 1 Xyz Material from this card.', null, 'https://images.ygoprodeck.com/images/cards/72167543.jpg', 'https://images.ygoprodeck.com/images/cards_small/72167543.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/72167543.jpg', '2014-01-24'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (34620088, 'Gimmick Puppet Shadow Feeler', 'Effect Monster', 'effect', 'Machine / Effect', 'Machine', 'DARK', 8, null, null, 1000, 1000, 'Cannot be destroyed by battle. When you take battle damage from an opponent''s direct attack while this card is in your Graveyard: You can Special Summon this card from your Graveyard in face-up Attack Position, and if you do, take 1000 damage. You can only use this effect of "Gimmick Puppet Shadow Feeler" once per turn. If this card is an Xyz Material and would be sent to the Graveyard, banish it instead.', 'Gimmick Puppet', 'https://images.ygoprodeck.com/images/cards/34620088.jpg', 'https://images.ygoprodeck.com/images/cards_small/34620088.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/34620088.jpg', '2014-03-28'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (92918648, 'Hierophant of Prophecy', 'XYZ Monster', 'xyz', 'Spellcaster / Xyz / Effect', 'Spellcaster', 'DARK', null, 7, null, 2800, 2600, '2 Level 7 Spellcaster-Type monsters
 Once per turn: You can detach 1 Xyz Material from this card; destroy Spell/Trap Card(s) your opponent controls, up to the number of "Spellbook" Spell Cards in your Graveyard.', 'Spellbook', 'https://images.ygoprodeck.com/images/cards/92918648.jpg', 'https://images.ygoprodeck.com/images/cards_small/92918648.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/92918648.jpg', '2012-08-18'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (24845628, 'Magicalized Duston Mop', 'Spell Card', 'spell', null, 'Equip', null, null, null, null, null, null, 'You can only control 1 "Magicalized Duston Mop". The equipped monster cannot be Tributed, or be used as a Fusion, Synchro, or Xyz Material for a Summon. When this card you control is destroyed by an opponent''s card effect and sent to your Graveyard: You can add 1 "Duston" monster from your Deck to your hand.', 'Duston', 'https://images.ygoprodeck.com/images/cards/24845628.jpg', 'https://images.ygoprodeck.com/images/cards_small/24845628.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/24845628.jpg', '2013-11-08'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (29095552, 'Masked HERO Acid', 'Fusion Monster', 'fusion', 'Warrior / Fusion / Effect', 'Warrior', 'WATER', 8, null, null, 2600, 2100, 'Must be Special Summoned with "Mask Change". When this card is Special Summoned: Destroy as many Spells and Traps your opponent controls as possible, and if you do, all monsters they control lose 300 ATK.', 'Masked HERO', 'https://images.ygoprodeck.com/images/cards/29095552.jpg', 'https://images.ygoprodeck.com/images/cards_small/29095552.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/29095552.jpg', '2012-03-16'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (29795530, 'Mischief of the Yokai', 'Trap Card', 'trap', null, 'Normal', null, null, null, null, null, null, 'Each face-up monster on the field loses 2 Levels, until the End Phase. You can remove from play this card from your Graveyard to select 1 face-up monster, and reduce its Level by 1, until the End Phase. This effect cannot be activated the turn this card is sent to the Graveyard.', null, 'https://images.ygoprodeck.com/images/cards/29795530.jpg', 'https://images.ygoprodeck.com/images/cards_small/29795530.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/29795530.jpg', '2010-11-06'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (16259549, 'Number 49: Fortune Tune', 'XYZ Monster', 'xyz', 'Winged Beast / Xyz / Effect', 'Winged Beast', 'LIGHT', null, 3, null, 400, 900, '2 Level 3 monsters
During each of your Standby Phases: Gain 500 Life Points. This card cannot be targeted by card effects. If this face-up card would be destroyed, you can detach 1 Xyz Material from this card instead. When this card is sent from the field to the Graveyard: Target 2 Level 3 monsters in your Graveyard; shuffle them both into the Deck, and if you do, return this card from your Graveyard to the Extra Deck. You can only use this effect of "Number 49: Fortune Tune" once per turn.', null, 'https://images.ygoprodeck.com/images/cards/16259549.jpg', 'https://images.ygoprodeck.com/images/cards_small/16259549.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/16259549.jpg', '2013-07-12'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (53244294, 'Number 57: Tri-Head Dust Dragon', 'XYZ Monster', 'xyz', 'Dragon / Xyz / Effect', 'Dragon', 'FIRE', null, 4, null, 100, 2600, '3 Level 4 monsters
When this card is Special Summoned: You can target 1 monster your opponent controls; this card gains ATK equal to that monster''s current ATK. If your opponent controls more cards than you do: You can detach 1 Xyz Material from this card, then choose 1 unused Main Monster Zone or Spell & Trap Zone; while this card is face-up on the field, that zone cannot be used.', null, 'https://images.ygoprodeck.com/images/cards/53244294.jpg', 'https://images.ygoprodeck.com/images/cards_small/53244294.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/53244294.jpg', '2013-07-12'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (32446630, 'Number C43: High Manipulator of Chaos', 'XYZ Monster', 'xyz', 'Fiend / Xyz / Effect', 'Fiend', 'DARK', null, 3, null, 0, 0, '4 Level 3 DARK monsters
 All Tokens you control can make a second attack during each Battle Phase. If this card has "Number 43: Manipulator of Souls" as an Xyz Material, it gains this effect.
● Once per turn: You can detach 1 Xyz Material from this card; Special Summon 1 "Manipulator Token" (Fiend-Type/DARK/Level 1/ATK ?/DEF ?). (When Summoned, its ATK and DEF each become equal to half the opponent''s current LP.)', 'Chaos', 'https://images.ygoprodeck.com/images/cards/32446630.jpg', 'https://images.ygoprodeck.com/images/cards_small/32446630.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/32446630.jpg', '2014-05-16'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (49195710, 'Number C65: King Overfiend', 'XYZ Monster', 'xyz', 'Fiend / Xyz / Effect', 'Fiend', 'DARK', null, 3, null, 1600, 0, '3 Level 3 DARK monsters
Once per turn: You can detach 1 Xyz Material from this card, then target 1 face-up monster your opponent controls; it loses 1000 ATK and DEF. While this card has "Number 65: Djinn Buster" as an Xyz Material, it gains this effect.
● Effect Monsters your opponent controls cannot activate their effects.', null, 'https://images.ygoprodeck.com/images/cards/49195710.jpg', 'https://images.ygoprodeck.com/images/cards_small/49195710.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/49195710.jpg', '2013-11-08'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (11522979, 'Number C69: Heraldry Crest of Horror', 'XYZ Monster', 'xyz', 'Psychic / Xyz / Effect', 'Psychic', 'LIGHT', null, 5, null, 4000, 1800, '4 Level 5 monsters
When an opponent''s monster declares an attack: You can destroy all cards your opponent controls. If this card has "Number 69: Heraldry Crest" as an Xyz Material, it gains this effect.
● Once per turn: You can detach 1 Xyz Material from this card, then target 1 face-up Xyz Monster your opponent controls; this card gains ATK equal to that face-up monster''s original ATK, and if it gains ATK this way, this card''s name becomes that monster''s, and it gains that monster''s original effect. These effects last until the End Phase.', 'Heraldry', 'https://images.ygoprodeck.com/images/cards/11522979.jpg', 'https://images.ygoprodeck.com/images/cards_small/11522979.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/11522979.jpg', '2014-01-24'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (847915, 'Number Wall', 'Trap Card', 'trap', null, 'Continuous', null, null, null, null, null, null, 'Activate only if you control a "Number" monster. "Number" monsters on the field cannot be destroyed by card effects, and cannot be destroyed by battle except with another "Number" monster. When a "Number" monster you control is destroyed, destroy this card.', null, 'https://images.ygoprodeck.com/images/cards/847915.jpg', 'https://images.ygoprodeck.com/images/cards_small/847915.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/847915.jpg', '2013-07-12'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (75574498, 'Princess Cologne', 'XYZ Monster', 'xyz', 'Fairy / Xyz / Effect', 'Fairy', 'LIGHT', null, 4, null, 500, 2200, '2 Level 4 monsters
When this card is Xyz Summoned: You can target 1 "Box of Friends" in your Graveyard; Special Summon that target. If you control another monster, your opponent cannot target this card with cards, effects, or for attacks. If a face-up Normal Monster(s) you control is destroyed by battle or by card effect and sent to the Graveyard: You can detach 1 Xyz Material from this card; Special Summon 1 Normal Monster from your Deck or Graveyard in face-up Defense Position.', null, 'https://images.ygoprodeck.com/images/cards/75574498.jpg', 'https://images.ygoprodeck.com/images/cards_small/75574498.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/75574498.jpg', '2013-07-12'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited'),
  (67038874, 'Scrap Mind Reader', 'Tuner Monster', 'effect', 'Machine / Tuner / Effect', 'Machine', 'EARTH', 1, null, null, 0, 0, 'Once per turn, while this card is in your Graveyard during your Main Phase 2, you can select 1 face-up "Scrap" monster you control, except "Scrap Mind Reader". Destroy that monster and Special Summon this card from the Graveyard. If you do, remove this card from play when it is removed from the field. If this card is used as a Synchro Material Monster, all other Synchro Material Monsters must be "Scrap" monsters.', 'Scrap', 'https://images.ygoprodeck.com/images/cards/67038874.jpg', 'https://images.ygoprodeck.com/images/cards_small/67038874.jpg', 'https://images.ygoprodeck.com/images/cards_cropped/67038874.jpg', '2010-11-06'::date, 'classic_v2_pool', false, 'Classic v2 pool card missing from the live catalog', 'unlimited')
on conflict (external_card_id) do nothing;

-- Same curated pack pool as the migrations: production's Iron Legion
-- misses these Cyber cards.
insert into public.shop_special_pack_pool_cards (pack_definition_id, card_catalog_id)
select d.id, c.id
from public.shop_special_pack_definitions d
join public.card_catalog c on c.name in (
  'Cyber Dragon Herz', 'Cyber Dragon Nachster', 'Cyber Dragon Nova', 'Cyber Emergency',
  'Cyber Repair Plant', 'Cyber Revsystem', 'Cyberload Fusion', 'Cybernetic Overflow'
)
where d.code = 'iron_legion'
on conflict (pack_definition_id, card_catalog_id) do nothing;

-- The slot themes point at the curated packs by code (the old values were
-- left-overs like 'ABC' or 'FIRE'; only an old-style description reads them).
update public.shop_special_pack_slots s
set theme_value = d.code
from public.shop_special_pack_definitions d
where d.id = s.pack_definition_id
  and s.theme_value is distinct from d.code;

-- ---------------------------------------------------------
-- 6. Function definitions: what the migrations say
--    (generated from the replayed pre-2.0 chain)
-- ---------------------------------------------------------

-- Production has this one returning void; the 2.0 chain expects integer.
drop function if exists public.distribute_competition_rewards_v2(target_competition_id uuid);

CREATE OR REPLACE FUNCTION public._award_match_duel_points_internal(target_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_match public.matches%rowtype;
  player_one_reward integer;
  player_two_reward integer;
begin
  select * into target_match from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if target_match.match_type = 'practice' then
    return;
  end if;

  if target_match.match_type <> 'league' then
    raise exception 'Unknown match type.';
  end if;

  player_one_reward := public._compute_league_match_reward(
    target_match.winner_id, target_match.player_one_id, target_match.player_two_id
  );
  player_two_reward := public._compute_league_match_reward(
    target_match.winner_id, target_match.player_two_id, target_match.player_one_id
  );

  if player_one_reward is null or player_two_reward is null then
    raise exception 'Invalid winner for this match.';
  end if;

  if not exists (
    select 1 from public.duel_point_transactions
    where match_id = target_match_id
      and profile_id = target_match.player_one_id
      and reason = 'match_reward'
  ) then
    perform public._credit_duel_points(
      target_match.player_one_id,
      player_one_reward,
      'match_reward',
      target_match_id,
      'Official League Duel reward.',
      jsonb_build_object(
        'match_type', 'league',
        'result',
        case
          when target_match.winner_id is null then 'draw'
          when target_match.winner_id = target_match.player_one_id then 'win'
          else 'loss'
        end
      )
    );
  end if;

  if not exists (
    select 1 from public.duel_point_transactions
    where match_id = target_match_id
      and profile_id = target_match.player_two_id
      and reason = 'match_reward'
  ) then
    perform public._credit_duel_points(
      target_match.player_two_id,
      player_two_reward,
      'match_reward',
      target_match_id,
      'Official League Duel reward.',
      jsonb_build_object(
        'match_type', 'league',
        'result',
        case
          when target_match.winner_id is null then 'draw'
          when target_match.winner_id = target_match.player_two_id then 'win'
          else 'loss'
        end
      )
    );
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.award_match_duel_points(target_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_id uuid;
  target_match public.matches%rowtype;
begin
  caller_id := auth.uid();

  if caller_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into target_match from public.matches where id = target_match_id;

  if not found then
    raise exception 'Match not found.';
  end if;

  if caller_id not in (target_match.player_one_id, target_match.player_two_id) then
    raise exception 'You are not part of this match.';
  end if;

  if target_match.status <> 'completed' then
    raise exception 'Match is not completed.';
  end if;

  perform public._award_match_duel_points_internal(target_match_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_shop_card_price(target_card_catalog_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_rarity text;
  target_score numeric;

  base_price integer;
  score_price integer;
begin
  select
    game_rarity,
    coalesce(rarity_score, 0)
  into
    target_rarity,
    target_score
  from public.card_catalog
  where id = target_card_catalog_id;

  if not found then
    raise exception 'Card not found.';
  end if;

  base_price :=
    case target_rarity
      when 'Normal' then 40
      when 'Rare' then 80
      when 'Super Rare' then 140
      when 'Ultra Rare' then 250
      when 'Secret Rare' then 450
      when 'Legendary' then 800
      else 60
    end;

  score_price :=
    round(
      greatest(
        0,
        target_score
      ) * 3
    );

  return greatest(
    25,
    base_price + score_price
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.correct_competition_match_result_v2(target_match_id uuid, target_player_one_duel_wins integer, target_player_two_duel_wins integer, target_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
  match_row public.matches%rowtype;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  computed_winner uuid;
  computed_result public.match_result_type;
  new_standing record;
  old_result_row record;
  old_grant record;
  rule_row public.competition_reward_rules%rowtype;
  new_balance integer;
  new_tx_id uuid;
  new_grant_id uuid;
  reversal_tx_id uuid;
  current_balance integer;
  actual_dp_reversal integer;
  dp_unrecovered integer;
  voucher_row record;
  voucher_recovered integer;
  voucher_unrecovered integer;
  match_dp_row record;
  match_dp_new_reward integer;
  match_dp_prior_total integer;
  match_dp_delta integer;
  match_dp_current_balance integer;
  match_dp_actual_debit integer;
  match_dp_new_balance integer;
  match_dp_correction_reason text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if target_reason is null or length(trim(target_reason)) = 0 then
    raise exception 'A correction reason is required.';
  end if;

  select * into match_row from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.competition_id is null then
    raise exception 'This match is not part of a competition.';
  end if;

  if match_row.status <> 'completed' then
    raise exception 'Only a completed match can be corrected - use submit_competition_match_result_v2 first.';
  end if;

  perform pg_advisory_xact_lock(hashtext('competition_reward_lifecycle_' || match_row.competition_id::text));

  select * into competition_row from public.competitions where id = match_row.competition_id for update;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can correct competition results.';
  end if;

  if match_row.match_format = 'single_duel' then
    if not (
      (target_player_one_duel_wins = 1 and target_player_two_duel_wins = 0)
      or (target_player_one_duel_wins = 0 and target_player_two_duel_wins = 1)
    ) then
      raise exception 'Single Duel requires exactly one winner (1-0 or 0-1).';
    end if;
  else
    if not (
      (target_player_one_duel_wins = 2 and target_player_two_duel_wins in (0, 1))
      or (target_player_two_duel_wins = 2 and target_player_one_duel_wins in (0, 1))
    ) then
      raise exception 'Best of 3 requires a first-to-2 score (2-0 or 2-1).';
    end if;
  end if;

  if target_player_one_duel_wins > target_player_two_duel_wins then
    computed_winner := match_row.player_one_id;
    computed_result := 'player_one_win';
  else
    computed_winner := match_row.player_two_id;
    computed_result := 'player_two_win';
  end if;

  update public.matches
  set
    player_one_duel_wins = target_player_one_duel_wins,
    player_two_duel_wins = target_player_two_duel_wins,
    winner_id = computed_winner,
    result = computed_result,
    notes = coalesce(notes || E'\n', '') || '[correction] ' || target_reason,
    updated_at = now()
  where id = target_match_id;

  -- ------------------------------------------------
  -- MATCH-LEVEL DP CORRECTION (BUG D). Delta-based against the
  -- ACTUAL ledger total for this match/player (sum of every
  -- 'match_reward' + every past 'match_reward_correction%' row), not
  -- the old in-memory winner - this is what makes repeated
  -- corrections of the same match idempotent, and what makes
  -- correcting a match that predates this migration (and so was
  -- never paid at all) come out exactly right: prior total is 0, so
  -- the full new amount is credited once, never double-counted
  -- against a reward that was never actually granted.
  --
  -- duel_point_transactions_match_reason_unique is a unique index on
  -- (match_id, profile_id, reason) - a literal 'match_reward_
  -- correction' reason on every correction would make a SECOND
  -- correction of the same match fail outright. Each correction
  -- therefore gets its own numbered reason
  -- ('match_reward_correction_2', '_3', ...) so the ledger can record
  -- an arbitrary number of corrections for the same match, each as
  -- its own immutable row - `like 'match_reward_correction%'` below
  -- matches all of them when summing the running total.
  -- ------------------------------------------------
  if match_row.match_type = 'league' then
    for match_dp_row in
      select * from (values
        (match_row.player_one_id, match_row.player_two_id),
        (match_row.player_two_id, match_row.player_one_id)
      ) as t(player_id, other_id)
    loop
      match_dp_new_reward := public._compute_league_match_reward(
        computed_winner, match_dp_row.player_id, match_dp_row.other_id
      );

      match_dp_prior_total := coalesce((
        select sum(amount) from public.duel_point_transactions
        where match_id = target_match_id
          and profile_id = match_dp_row.player_id
          and (reason = 'match_reward' or reason like 'match_reward_correction%')
      ), 0);

      match_dp_delta := match_dp_new_reward - match_dp_prior_total;

      if match_dp_delta <> 0 then
        match_dp_correction_reason := 'match_reward_correction_' || (
          1 + (
            select count(*) from public.duel_point_transactions
            where match_id = target_match_id
              and profile_id = match_dp_row.player_id
              and reason like 'match_reward_correction%'
          )
        )::text;
      end if;

      if match_dp_delta > 0 then
        perform public._credit_duel_points(
          match_dp_row.player_id,
          match_dp_delta,
          match_dp_correction_reason,
          target_match_id,
          'Competition match result corrected.',
          jsonb_build_object('correction_reason', target_reason, 'delta', match_dp_delta)
        );
      elsif match_dp_delta < 0 then
        select duel_points into match_dp_current_balance
        from public.profiles
        where id = match_dp_row.player_id
        for update;

        match_dp_actual_debit := least(match_dp_current_balance, -match_dp_delta);

        if match_dp_actual_debit > 0 then
          update public.profiles
          set duel_points = duel_points - match_dp_actual_debit, updated_at = now()
          where id = match_dp_row.player_id
          returning duel_points into match_dp_new_balance;

          insert into public.duel_point_transactions (
            profile_id, match_id, amount, balance_after, reason, note, metadata
          ) values (
            match_dp_row.player_id, target_match_id, -match_dp_actual_debit, match_dp_new_balance,
            match_dp_correction_reason, 'Competition match result corrected.',
            jsonb_build_object(
              'correction_reason', target_reason,
              'requested_delta', match_dp_delta,
              'actual_delta', -match_dp_actual_debit,
              'unrecovered', (-match_dp_delta) - match_dp_actual_debit
            )
          );
        end if;
      end if;
    end loop;
  end if;

  if competition_row.status <> 'completed' then
    -- Not finalized yet - live standings will simply reflect the
    -- corrected match on next read. Nothing to reconcile for
    -- PLACEMENT rewards (match DP above already ran regardless).
    return;
  end if;

  for new_standing in
    select * from public.get_competition_standings_v2(match_row.competition_id)
  loop
    select * into old_result_row
    from public.competition_results
    where competition_id = match_row.competition_id
      and profile_id = new_standing.profile_id;

    update public.competition_results
    set
      placement = new_standing.placement,
      wins = new_standing.wins,
      losses = new_standing.losses,
      draws = new_standing.draws,
      points = new_standing.points
    where competition_id = match_row.competition_id
      and profile_id = new_standing.profile_id;

    if old_result_row is null or old_result_row.placement is distinct from new_standing.placement then
      select * into old_grant
      from public.competition_reward_grants
      where competition_id = match_row.competition_id
        and profile_id = new_standing.profile_id
        and status = 'granted';

      if found then
        reversal_tx_id := null;
        actual_dp_reversal := 0;
        dp_unrecovered := 0;
        voucher_recovered := 0;
        voucher_unrecovered := 0;

        -- ------------------------------------------------
        -- DP REVERSAL. duel_points can never go negative
        -- (profiles_duel_points_check) so at most the player's
        -- CURRENT balance can actually be clawed back. The
        -- transaction amount logged below always equals the real
        -- debit - never the originally-granted amount if that's
        -- not what was actually taken. Anything short of the full
        -- amount is recorded as an explicit unrecovered remainder
        -- on the grant row (see step below), never silently
        -- dropped.
        -- ------------------------------------------------
        if old_grant.duel_points_granted > 0 then
          select duel_points into current_balance
          from public.profiles
          where id = new_standing.profile_id
          for update;

          actual_dp_reversal := least(current_balance, old_grant.duel_points_granted);
          dp_unrecovered := old_grant.duel_points_granted - actual_dp_reversal;

          if actual_dp_reversal > 0 then
            update public.profiles
            set duel_points = duel_points - actual_dp_reversal, updated_at = now()
            where id = new_standing.profile_id
            returning duel_points into new_balance;

            insert into public.duel_point_transactions (
              profile_id, amount, balance_after, reason, metadata
            ) values (
              new_standing.profile_id, -actual_dp_reversal, new_balance,
              'competition_reward_reversal',
              jsonb_build_object(
                'competition_id', match_row.competition_id,
                'previous_placement', old_grant.placement,
                'reason', target_reason,
                'grant_id', old_grant.id,
                'requested_reversal', old_grant.duel_points_granted,
                'actual_reversal', actual_dp_reversal,
                'unrecovered', dp_unrecovered
              )
            )
            returning id into reversal_tx_id;
          end if;
        end if;

        -- ------------------------------------------------
        -- VOUCHER REVERSAL. Only reward_vouchers rows precisely
        -- traceable to THIS grant (competition_reward_grant_id)
        -- are touched - never "any voucher of this type", which
        -- would risk reclaiming a voucher from an unrelated
        -- source. Rows are locked first so a concurrent spend
        -- (purchase_shop_pack) can't consume one out from under
        -- this reversal. A voucher already fully spent has no row
        -- left to reclaim - recorded as an explicit unrecovered
        -- amount, never resurrected.
        -- ------------------------------------------------
        if old_grant.voucher_type is not null and old_grant.voucher_quantity > 0 then
          for voucher_row in
            select id, quantity
            from public.reward_vouchers
            where competition_reward_grant_id = old_grant.id
            for update
          loop
            voucher_recovered := voucher_recovered + voucher_row.quantity;
          end loop;

          voucher_unrecovered := greatest(0, old_grant.voucher_quantity - voucher_recovered);

          delete from public.reward_vouchers
          where competition_reward_grant_id = old_grant.id;
        end if;

        update public.competition_reward_grants
        set
          status = 'reversed',
          reversed_at = now(),
          reversal_reason = target_reason,
          duel_points_recovered = actual_dp_reversal,
          duel_points_unrecovered = dp_unrecovered,
          voucher_quantity_recovered = voucher_recovered,
          voucher_quantity_unrecovered = voucher_unrecovered
        where id = old_grant.id;
      end if;

      select * into rule_row
      from public.competition_reward_rules
      where competition_id = match_row.competition_id
        and placement = new_standing.placement;

      if found then
        new_tx_id := null;

        insert into public.competition_reward_grants (
          competition_id, profile_id, placement, duel_points_granted,
          voucher_type, voucher_quantity, duel_point_transaction_id, status
        ) values (
          match_row.competition_id, new_standing.profile_id, new_standing.placement,
          coalesce(rule_row.duel_points, 0), rule_row.voucher_type,
          coalesce(rule_row.voucher_quantity, 0), null, 'granted'
        )
        returning id into new_grant_id;

        if rule_row.duel_points > 0 then
          update public.profiles
          set duel_points = duel_points + rule_row.duel_points, updated_at = now()
          where id = new_standing.profile_id
          returning duel_points into new_balance;

          insert into public.duel_point_transactions (
            profile_id, amount, balance_after, reason, metadata
          ) values (
            new_standing.profile_id, rule_row.duel_points, new_balance, 'competition_reward',
            jsonb_build_object(
              'competition_id', match_row.competition_id,
              'placement', new_standing.placement,
              'correction_reason', target_reason,
              'grant_id', new_grant_id
            )
          )
          returning id into new_tx_id;

          update public.competition_reward_grants
          set duel_point_transaction_id = new_tx_id
          where id = new_grant_id;
        end if;

        if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
          insert into public.reward_vouchers (
            profile_id, voucher_type, quantity, source_type, source_id, competition_reward_grant_id
          ) values (
            new_standing.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
            'competition_reward_correction', match_row.competition_id, new_grant_id
          );
        end if;
      end if;
    end if;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_competition_v2(target_league_id uuid, target_name text, target_meetings_per_pairing integer, target_match_format text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
  is_admin boolean;
  new_competition_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = target_league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can create a competition.';
  end if;

  if target_name is null or length(trim(target_name)) = 0 then
    raise exception 'Competition name is required.';
  end if;

  if target_meetings_per_pairing is null or target_meetings_per_pairing < 1 then
    raise exception 'meetings_per_pairing must be at least 1.';
  end if;

  if target_match_format not in ('single_duel', 'best_of_3') then
    raise exception 'Invalid match format.';
  end if;

  insert into public.competitions (
    league_id,
    name,
    competition_type,
    status,
    meetings_per_pairing,
    match_format,
    created_by
  )
  values (
    target_league_id,
    trim(target_name),
    'round_robin',
    'draft',
    target_meetings_per_pairing,
    target_match_format,
    current_user_id
  )
  returning id
  into new_competition_id;

  -- BUG B fix: V1's create_competition always seeded reward rules
  -- via install_default_competition_rewards - V2 never had an
  -- equivalent call until now.
  perform public.install_default_competition_rewards_v2(new_competition_id);

  return new_competition_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.distribute_competition_rewards_v2(target_competition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  result_row record;
  rule_row public.competition_reward_rules%rowtype;
  new_balance integer;
  new_tx_id uuid;
  new_grant_id uuid;
  grants_created integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  perform pg_advisory_xact_lock(hashtext('competition_reward_lifecycle_' || target_competition_id::text));

  select * into competition_row from public.competitions where id = target_competition_id for update;

  if not found then
    raise exception 'Competition not found.';
  end if;

  if competition_row.meetings_per_pairing is null then
    raise exception 'This is a V1 competition.';
  end if;

  if competition_row.status <> 'completed' then
    raise exception 'Competition must be finalized before rewards can be distributed.';
  end if;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can distribute rewards.';
  end if;

  -- BUG B defensive fallback: covers every V2 competition created
  -- before this migration (create_competition_v2 never used to seed
  -- rules at all) so this call can't silently no-op for them either.
  -- A no-op (on conflict do nothing) for any competition that
  -- already has rules, whether from the fix above or a prior manual
  -- SQL insert.
  if not exists (
    select 1 from public.competition_reward_rules
    where competition_id = target_competition_id
  ) then
    perform public.install_default_competition_rewards_v2(target_competition_id);
  end if;

  for result_row in
    select profile_id, placement
    from public.competition_results
    where competition_id = target_competition_id
  loop
    if exists (
      select 1 from public.competition_reward_grants
      where competition_id = target_competition_id
        and profile_id = result_row.profile_id
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_reward_rules
    where competition_id = target_competition_id
      and placement = result_row.placement;

    if not found then
      continue;
    end if;

    new_tx_id := null;

    insert into public.competition_reward_grants (
      competition_id, profile_id, placement, duel_points_granted,
      voucher_type, voucher_quantity, duel_point_transaction_id, status
    ) values (
      target_competition_id, result_row.profile_id, result_row.placement,
      coalesce(rule_row.duel_points, 0), rule_row.voucher_type,
      coalesce(rule_row.voucher_quantity, 0), null, 'granted'
    )
    returning id into new_grant_id;

    grants_created := grants_created + 1;

    if rule_row.duel_points > 0 then
      update public.profiles
      set duel_points = duel_points + rule_row.duel_points, updated_at = now()
      where id = result_row.profile_id
      returning duel_points into new_balance;

      insert into public.duel_point_transactions (
        profile_id, amount, balance_after, reason, metadata
      ) values (
        result_row.profile_id, rule_row.duel_points, new_balance, 'competition_reward',
        jsonb_build_object(
          'competition_id', target_competition_id,
          'placement', result_row.placement,
          'grant_id', new_grant_id
        )
      )
      returning id into new_tx_id;

      update public.competition_reward_grants
      set duel_point_transaction_id = new_tx_id
      where id = new_grant_id;
    end if;

    if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id, voucher_type, quantity, source_type, source_id, competition_reward_grant_id
      ) values (
        result_row.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
        'competition_reward', target_competition_id, new_grant_id
      );
    end if;
  end loop;

  update public.competitions
  set rewards_distributed_at = coalesce(rewards_distributed_at, now())
  where id = target_competition_id;

  return grants_created;
end;
$function$;

CREATE OR REPLACE FUNCTION public.install_default_round_rewards_v2(target_competition_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d public.league_economy_defaults%rowtype;
begin
  select * into d
  from public.league_economy_defaults
  where id = true;

  if not found then
    raise exception 'league_economy_defaults is missing.';
  end if;

  insert into public.competition_round_reward_rules (
    competition_id, role, duel_points, voucher_type, voucher_quantity
  ) values
    (
      target_competition_id,
      'participation',
      d.round_participation_dp,
      d.round_participation_voucher_type,
      d.round_participation_voucher_quantity
    ),
    (
      target_competition_id,
      'round_winner',
      d.round_first_dp,
      d.round_first_voucher_type,
      d.round_first_voucher_quantity
    ),
    (
      target_competition_id,
      'round_runner_up',
      d.round_second_dp,
      null,
      0
    ),
    (
      target_competition_id,
      'round_third',
      d.round_third_dp,
      null,
      0
    )
  on conflict (competition_id, role)
  do update set
    duel_points = excluded.duel_points,
    voucher_type = excluded.voucher_type,
    voucher_quantity = excluded.voucher_quantity,
    updated_at = now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_league_admin(target_league uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.league_members lm
    where lm.league_id = target_league
      and lm.profile_id = (select auth.uid())
      and lm.role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.purchase_shop_pack(target_pack_code text, target_voucher_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
  current_league_id uuid;
  active_rotation_id uuid;
  theme_category text;
  special_rotation_id uuid;
  pack_price integer;
  pack_card_count integer;
  required_voucher_type text;
  current_dp integer;
  voucher_row public.reward_vouchers%rowtype;
  purchase_id uuid;
  opening_id uuid;
  position_number integer;
  pack_peak_rarity text;
  pack_peak_position integer;
  v_luck_points numeric := 0;
  luck_gain numeric;
  luck_guaranteed_legendary boolean := false;
  rolled_rarity text;
  chosen_card_id uuid;
  chosen_card_rarity text;
  copy_limit integer;
  current_owned_count integer;
  next_copy_number integer;
  new_instance_id uuid;
  attempts integer;
  is_first_pull boolean;
begin
  -- =======================================================
  -- AUTH
  -- =======================================================
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  -- =======================================================
  -- CURRENT LEAGUE
  -- =======================================================
  select
    lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = current_user_id
  limit 1;

  if current_league_id is null then
    raise exception 'Current user is not a league member.';
  end if;

  -- =======================================================
  -- VALID PACK
  -- =======================================================
  if target_pack_code not in ('normal', 'premium', 'deluxe', 'special_attribute', 'special_archetype', 'special_monster_type') then
    raise exception 'Invalid pack type.';
  end if;

  active_rotation_id := public.get_active_shop_rotation();

  if target_pack_code in ('special_attribute', 'special_archetype', 'special_monster_type') then
    theme_category := case target_pack_code
      when 'special_attribute' then 'attribute'
      when 'special_archetype' then 'archetype'
      when 'special_monster_type' then 'monster_type'
    end;
  end if;

  -- =======================================================
  -- PACK CONFIG
  -- =======================================================
  if theme_category is null then
    select
      price_dp,
      cards_per_pack
    into
      pack_price,
      pack_card_count
    from public.shop_pack_types
    where
      code = target_pack_code
      and active = true;

    if not found then
      raise exception 'Pack is not available.';
    end if;
  else
    special_rotation_id := public.get_active_special_pack_rotation(theme_category);

    if special_rotation_id is null then
      raise exception 'No active special pack rotation for this theme.';
    end if;

    select
      price_dp,
      cards_per_pack
    into
      pack_price,
      pack_card_count
    from public.shop_special_pack_rotations
    where id = special_rotation_id;

    if pack_price is null or pack_card_count is null then
      raise exception 'Special Pack is not configured for this rotation.';
    end if;
  end if;

  -- =======================================================
  -- VOUCHER TYPE
  -- =======================================================
  required_voucher_type :=
    case target_pack_code
      when 'normal' then 'normal_pack'
      when 'premium' then 'premium_pack'
      when 'deluxe' then 'deluxe_pack'
      when 'special_attribute' then 'special_pack'
      when 'special_archetype' then 'special_pack'
      when 'special_monster_type' then 'special_pack'
    end;

  -- =======================================================
  -- PAYMENT
  -- =======================================================
  if target_voucher_id is not null then
    select *
    into voucher_row
    from public.reward_vouchers
    where
      id = target_voucher_id
      and profile_id = current_user_id
    for update;

    if not found then
      raise exception 'Voucher not found.';
    end if;

    if voucher_row.voucher_type <> required_voucher_type then
      raise exception 'This voucher cannot be used for this pack.';
    end if;
  else
    select
      duel_points
    into current_dp
    from public.profiles
    where id = current_user_id
    for update;

    if not found then
      raise exception 'Profile not found.';
    end if;

    if current_dp < pack_price then
      raise exception 'Not enough Duel Points.';
    end if;

    update public.profiles
    set
      duel_points = duel_points - pack_price,
      updated_at = now()
    where id = current_user_id;
  end if;

  -- =======================================================
  -- PURCHASE
  -- =======================================================
  insert into public.shop_purchases (
    profile_id,
    purchase_type,
    rotation_id,
    special_pack_rotation_id,
    pack_type_id,
    used_voucher_id,
    voucher_type_used,
    dp_spent
  )
  values (
    current_user_id,
    case
      when theme_category is not null then 'special_pack'
      else 'pack'
    end,
    active_rotation_id,
    special_rotation_id,
    case
      when theme_category is not null then null
      else (
        select id
        from public.shop_pack_types
        where code = target_pack_code
        limit 1
      )
    end,
    target_voucher_id,
    case
      when target_voucher_id is not null then required_voucher_type
      else null
    end,
    case
      when target_voucher_id is null then pack_price
      else 0
    end
  )
  returning id
  into purchase_id;

  -- =======================================================
  -- PACK OPENING
  -- =======================================================
  insert into public.shop_pack_openings (
    profile_id,
    purchase_id,
    rotation_id,
    special_pack_rotation_id,
    pack_code
  )
  values (
    current_user_id,
    purchase_id,
    active_rotation_id,
    special_rotation_id,
    target_pack_code
  )
  returning id
  into opening_id;

  -- =======================================================
  -- LEGENDARY LUCK STATE (go-live rebuild, 2026-09-01)
  --
  -- Replaces the old streak-pity
  -- entirely (see this migration's header for why: the go-live spec
  -- calls for ONE minimal, hidden, Legendary-only pity mechanic, not
  -- a separate frequent Ultra/Secret floor stacked on top of it).
  -- One row per player (not per pack type - "Luck gained per pack"
  -- accumulates from every pack purchase into a single counter).
  -- =======================================================
  insert into public.player_pack_luck (
    profile_id,
    luck_points
  )
  values (
    current_user_id,
    0
  )
  on conflict (profile_id)
  do nothing;

  select
    luck_points
  into v_luck_points
  from public.player_pack_luck
  where profile_id = current_user_id
  for update;

  luck_gain := case target_pack_code
    when 'normal' then 0.25
    when 'premium' then 1
    when 'deluxe' then 2
    when 'special_attribute' then 1.25 when 'special_archetype' then 1.25 when 'special_monster_type' then 1.25
  end;

  -- =======================================================
  -- PACK-LEVEL PEAK RARITY
  --
  -- Exactly ONE roll per pack determines its single meaningful/
  -- exciting hit (Legendary, Secret Rare, Ultra Rare, Super Rare, or
  -- none) via roll_shop_pack_peak_rarity() - unchanged from the
  -- Phase 3 rebuild. Every other card in the pack is "filler"
  -- (Normal/Rare foundation only, via roll_shop_pack_filler_rarity())
  -- so filler slots can never independently reproduce a top-tier hit.
  --
  -- EMERGENCY LEGENDARY PROTECTION: at >=100 accumulated Luck without
  -- a natural Legendary, this pack's peak is force-upgraded to
  -- Legendary regardless of the roll above - checked against the
  -- luck accumulated BEFORE this pack's own gain is added, matching
  -- "the NEXT pack after crossing ~100 guarantees one." Every pack
  -- tier is "eligible" for this guarantee (all four have a nonzero
  -- natural Legendary chance in roll_shop_pack_peak_rarity's own
  -- table) - if a future design wants to exclude Standard from
  -- redeeming the guarantee, add `and target_pack_code <> 'normal'`
  -- to the condition below.
  -- =======================================================
  pack_peak_rarity := public.roll_shop_pack_peak_rarity(target_pack_code);

  if pack_peak_rarity is distinct from 'Legendary' and v_luck_points >= 100 then
    pack_peak_rarity := 'Legendary';
    luck_guaranteed_legendary := true;
  end if;

  -- Natural Legendary resets luck to 0; a guaranteed one (already at
  -- >=100) also resets to 0 rather than continuing to climb past the
  -- threshold. Any other outcome accumulates this pack's luck_gain.
  if pack_peak_rarity = 'Legendary' then
    v_luck_points := 0;
  else
    v_luck_points := v_luck_points + luck_gain;
  end if;

  update public.player_pack_luck
  set
    luck_points = v_luck_points,
    updated_at = now()
  where profile_id = current_user_id;

  -- One randomly chosen slot in the pack carries the peak hit (when
  -- there is one this pack) so the exciting card isn't predictably
  -- always the last one opened.
  pack_peak_position := 1 + floor(random() * pack_card_count)::integer;

  -- =======================================================
  -- GENERATE CARDS
  -- =======================================================
  for position_number in 1..pack_card_count loop
    if position_number = pack_peak_position and pack_peak_rarity is not null then
      rolled_rarity := pack_peak_rarity;
    else
      rolled_rarity := public.roll_shop_pack_filler_rarity(target_pack_code);
    end if;

    -- =====================================================
    -- PICK CARD
    -- =====================================================
    attempts := 0;

    loop
      attempts := attempts + 1;

      if attempts > 25 then
        raise exception 'Could not find an eligible card for this pack.';
      end if;

      chosen_card_id := public.pick_shop_pack_card(
        current_user_id,
        rolled_rarity,
        special_rotation_id
      );

      if chosen_card_id is null then
        raise exception 'Could not select a card for this pack.';
      end if;

      perform pg_advisory_xact_lock(hashtext(chosen_card_id::text));

      select
        game_rarity
      into chosen_card_rarity
      from public.card_catalog
      where id = chosen_card_id;

      if chosen_card_rarity is null then
        raise exception 'Selected card has no rarity.';
      end if;

      copy_limit := public.shop_card_copy_limit(chosen_card_rarity);

      -- LEAGUE-WIDE LEGENDARY SCARCITY FIX (2026-08-30):
      -- shop_card_copy_limit()'s own comment has always said
      -- "Legendary = max 1 copy per league, everything else = max
      -- 3" - but this count query used to filter by
      -- current_owner_id = current_user_id for every rarity, making
      -- the Legendary limit a max of 1 copy PER PLAYER instead of
      -- one copy total across the whole league (each of the 3
      -- friends could pull their own "only" copy of the same
      -- Legendary). Legendary now counts every instance of this
      -- card in the league regardless of owner; every other rarity
      -- keeps its original per-player cap unchanged. Race-safe
      -- under the pg_advisory_xact_lock(hashtext(chosen_card_id::text))
      -- already taken above for this exact card_catalog_id, which
      -- was always keyed league-wide (not per-player) - so this was
      -- already safe to make league-wide, nothing else needed to
      -- change for concurrency.
      if chosen_card_rarity = 'Legendary' then
        select count(*)
        into current_owned_count
        from public.card_instances
        where
          league_id = current_league_id
          and card_catalog_id = chosen_card_id;
      else
        select count(*)
        into current_owned_count
        from public.card_instances
        where
          league_id = current_league_id
          and current_owner_id = current_user_id
          and card_catalog_id = chosen_card_id;
      end if;

      exit when current_owned_count < copy_limit;
    end loop;

    -- =====================================================
    -- FIRST-EVER PULL CHECK (Legendary only)
    --
    -- Computed here, under the pg_advisory_xact_lock already
    -- taken above for this exact card_catalog_id - race-safe
    -- against concurrent purchases of the same card by design,
    -- not a client-side guess. Checked BEFORE the new instance
    -- below is inserted.
    --
    -- IMPORTANT: this is NOT "was this player the original_owner_id
    -- of some existing instance" - that only reflects the very
    -- first acquirer of a card_instance row and goes stale the
    -- moment that instance changes hands (trade, wager, any other
    -- ownership transfer). A player who received this exact
    -- card_catalog_id via trade and later traded it away again
    -- would wrongly read as "never owned" under that check.
    --
    -- public.ownership_history is the source of truth for every
    -- acquisition of every card_instance, for both the initial
    -- acquisition (INSERT trigger, to_owner_id = acquirer) and
    -- every later transfer (UPDATE trigger, to_owner_id = new
    -- owner) - see record_card_ownership_history() in
    -- 202608190004_card_instances.sql. So "has this player ever
    -- owned this card_catalog_id, via any route" is exactly
    -- "does a row exist where to_owner_id = current_user_id for
    -- any card_instance of this card_catalog_id", regardless of
    -- whether that player still holds it today.
    -- =====================================================
    is_first_pull := null;

    if chosen_card_rarity = 'Legendary' then
      select not exists (
        select 1
        from public.card_instances ci
        join public.ownership_history oh
          on oh.card_instance_id = ci.id
        where
          ci.card_catalog_id = chosen_card_id
          and oh.to_owner_id = current_user_id
      )
      into is_first_pull;
    end if;

    -- =====================================================
    -- COPY NUMBER PER LEAGUE
    -- =====================================================
    select
      coalesce(max(copy_number), 0) + 1
    into next_copy_number
    from public.card_instances
    where
      league_id = current_league_id
      and card_catalog_id = chosen_card_id;

    -- =====================================================
    -- CREATE CARD INSTANCE
    --
    -- Definitive shop ownership metadata
    -- =====================================================
    insert into public.card_instances (
      league_id,
      card_catalog_id,
      copy_number,
      current_owner_id,
      original_owner_id,
      original_acquisition_type,
      original_source_id,
      acquired_at,
      locked
    )
    values (
      current_league_id,
      chosen_card_id,
      next_copy_number,
      current_user_id,
      current_user_id,
      'shop',
      opening_id,
      now(),
      false
    )
    returning id
    into new_instance_id;

    -- =====================================================
    -- RECORD PULL
    -- =====================================================
    insert into public.shop_pack_pulls (
      opening_id,
      card_catalog_id,
      card_instance_id,
      pull_position,
      pulled_rarity,
      is_first_for_player
    )
    values (
      opening_id,
      chosen_card_id,
      new_instance_id,
      position_number,
      chosen_card_rarity,
      is_first_pull
    );

  end loop;

  -- =======================================================
  -- CONSUME VOUCHER
  -- =======================================================
  if target_voucher_id is not null then
    if voucher_row.quantity <= 1 then
      delete from public.reward_vouchers
      where id = target_voucher_id;
    else
      update public.reward_vouchers
      set
        quantity = quantity - 1,
        updated_at = now()
      where id = target_voucher_id;
    end if;
  end if;

  return opening_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_shop_singles_rotation_if_needed()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  next_rotation_id uuid;
  next_rotation_number integer;
  picked_ids uuid[] := array[]::uuid[];
  target_rarities text[] := array['Normal', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare'];
  target_rarity text;
  slot_number integer := 0;
  candidate_id uuid;
  candidate_rarity text;

  local_now timestamp;
  local_window_start timestamp;
  window_start timestamptz;
  window_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('shop_singles_refresh'));

  if exists (
    select 1
    from public.shop_rotations
    where
      status = 'active'
      and starts_at <= now()
      and ends_at > now()
  ) then
    return;
  end if;

  update public.shop_rotations
  set
    status = 'completed',
    updated_at = now()
  where
    status = 'active'
    and ends_at <= now();

  -- Determine the current Dutch-local 20:00 -> 20:00 window.
  local_now := now() at time zone 'Europe/Amsterdam';

  if local_now::time >= time '20:00' then
    local_window_start := date_trunc('day', local_now) + interval '20 hours';
  else
    local_window_start := date_trunc('day', local_now) - interval '1 day' + interval '20 hours';
  end if;

  window_start := local_window_start at time zone 'Europe/Amsterdam';
  window_end := (local_window_start + interval '1 day') at time zone 'Europe/Amsterdam';

  select coalesce(max(rotation_number), 0) + 1
  into next_rotation_number
  from public.shop_rotations;

  insert into public.shop_rotations (
    starts_at,
    ends_at,
    status,
    rotation_number
  )
  values (
    window_start,
    window_end,
    'active',
    next_rotation_number
  )
  returning id
  into next_rotation_id;

  -- One slot per targeted rarity.
  foreach target_rarity in array target_rarities loop
    slot_number := slot_number + 1;

    select cc.id, cc.game_rarity
    into candidate_id, candidate_rarity
    from public.card_catalog cc
    where
      cc.format_eligible = true
      and public.is_master_duel_offerable(cc.master_duel_status)
      and cc.game_rarity = target_rarity
      and cc.id <> all(picked_ids)
    order by random()
    limit 1;

    if candidate_id is null then
      select cc.id, cc.game_rarity
      into candidate_id, candidate_rarity
      from public.card_catalog cc
      where
        cc.format_eligible = true
        and public.is_master_duel_offerable(cc.master_duel_status)
        and cc.id <> all(picked_ids)
      order by random()
      limit 1;
    end if;

    if candidate_id is not null then
      picked_ids := array_append(picked_ids, candidate_id);

      insert into public.shop_rotation_cards (
        rotation_id,
        slot_number,
        card_catalog_id,
        price_dp,
        slot_tier
      )
      values (
        next_rotation_id,
        slot_number,
        candidate_id,
        public.shop_single_card_price(candidate_rarity),
        public.shop_single_card_slot_tier(candidate_rarity)
      );
    end if;
  end loop;

  -- Wildcard slot.
  slot_number := slot_number + 1;

  select cc.id, cc.game_rarity
  into candidate_id, candidate_rarity
  from public.card_catalog cc
  where
    cc.format_eligible = true
    and public.is_master_duel_offerable(cc.master_duel_status)
    and cc.id <> all(picked_ids)
  order by random()
  limit 1;

  if candidate_id is not null then
    insert into public.shop_rotation_cards (
      rotation_id,
      slot_number,
      card_catalog_id,
      price_dp,
      slot_tier
    )
    values (
      next_rotation_id,
      slot_number,
      candidate_id,
      public.shop_single_card_price(candidate_rarity),
      public.shop_single_card_slot_tier(candidate_rarity)
    );
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_achievement_claim(target_achievement_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid;
  caller_league_id uuid;
  caller_duelist_name text;

  achievement_row public.achievements%rowtype;

  computed_period_key text;
  new_claim_id uuid;
begin

  current_user_id :=
    (select auth.uid());

  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select league_id
  into caller_league_id
  from public.league_members
  where profile_id = current_user_id
  limit 1;

  if caller_league_id is null then
    raise exception 'You are not a member of any league';
  end if;

  select *
  into achievement_row
  from public.achievements
  where key = target_achievement_key
    and active = true;

  if not found then
    raise exception 'Achievement not found';
  end if;

  if achievement_row.eligible_duelist_name is not null then

    select duelist_name
    into caller_duelist_name
    from public.profiles
    where id = current_user_id;

    if caller_duelist_name is null
      or lower(caller_duelist_name) <>
        lower(achievement_row.eligible_duelist_name)
    then
      raise exception
        'This achievement is not available to you.';
    end if;

  end if;

  if achievement_row.cadence = 'weekly' then
    computed_period_key :=
      to_char(date_trunc('week', now()), 'IYYY-"W"IW');
  else
    computed_period_key := 'once';
  end if;

  if exists (
    select 1
    from public.achievement_claims
    where achievement_id = achievement_row.id
      and claimant_id = current_user_id
      and period_key = computed_period_key
      and status = 'pending'
  ) then
    raise exception
      'You already have a pending claim for this achievement.';
  end if;

  if exists (
    select 1
    from public.achievement_claims
    where achievement_id = achievement_row.id
      and claimant_id = current_user_id
      and period_key = computed_period_key
      and status = 'approved'
  ) then
    raise exception '%',
      case
        when achievement_row.cadence = 'weekly'
          then 'You already claimed this achievement this week.'
        else 'This one-time achievement has already been claimed.'
      end;
  end if;

  insert into public.achievement_claims (
    achievement_id,
    claimant_id,
    league_id,
    period_key
  )
  values (
    achievement_row.id,
    current_user_id,
    caller_league_id,
    computed_period_key
  )
  returning id
  into new_claim_id;

  return new_claim_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.settle_round_rewards_v2(target_competition_id uuid, target_round_number integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  player_count integer;
  cycle_size integer;
  expected_matches integer;
  logical_round_number integer;
  block_start integer;
  block_end integer;
  match_count integer;
  incomplete_count integer;
  participant record;
  placement_row record;
  rule_row public.competition_round_reward_rules%rowtype;
  new_balance integer;
  new_tx_id uuid;
  new_grant_id uuid;
  grants_created integer := 0;
  v_reward_role text;
  v_reward_reason text;
begin
  perform pg_advisory_xact_lock(
    hashtext(
      'competition_full_round_settlement_' ||
      target_competition_id::text || '_' ||
      target_round_number::text
    )
  );

  select count(*)
  into player_count
  from public.competition_players
  where competition_id = target_competition_id;

  if player_count < 2 then
    return 0;
  end if;

  -- Number of schedule rounds needed for everyone to face everyone once.
  cycle_size := case
    when mod(player_count, 2) = 0 then player_count - 1
    else player_count
  end;

  expected_matches := (player_count * (player_count - 1)) / 2;

  logical_round_number := ((target_round_number - 1) / cycle_size) + 1;
  block_start := ((logical_round_number - 1) * cycle_size) + 1;
  block_end := logical_round_number * cycle_size;

  select count(*)
  into match_count
  from public.matches
  where competition_id = target_competition_id
    and tiebreak_id is null
    and round_number between block_start and block_end;

  -- Never settle an incomplete/partial cycle.
  if match_count <> expected_matches then
    return 0;
  end if;

  select count(*)
  into incomplete_count
  from public.matches
  where competition_id = target_competition_id
    and tiebreak_id is null
    and round_number between block_start and block_end
    and status <> 'completed';

  if incomplete_count > 0 then
    return 0;
  end if;

  perform public.install_default_round_rewards_v2(target_competition_id);

  -- ---------------- participation: all registered players ----------------
  for participant in
    select cp.profile_id
    from public.competition_players cp
    where cp.competition_id = target_competition_id
  loop
    if exists (
      select 1
      from public.competition_round_reward_grants
      where competition_id = target_competition_id
        and round_number = logical_round_number
        and profile_id = participant.profile_id
        and reward_role = 'participation'
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_round_reward_rules
    where competition_id = target_competition_id
      and role = 'participation';

    insert into public.competition_round_reward_grants (
      competition_id,
      round_number,
      profile_id,
      reward_role,
      duel_points_granted,
      voucher_type,
      voucher_quantity,
      status
    ) values (
      target_competition_id,
      logical_round_number,
      participant.profile_id,
      'participation',
      rule_row.duel_points,
      rule_row.voucher_type,
      rule_row.voucher_quantity,
      'granted'
    )
    returning id into new_grant_id;

    grants_created := grants_created + 1;
    new_tx_id := null;

    if rule_row.duel_points > 0 then
      update public.profiles
      set duel_points = duel_points + rule_row.duel_points,
          updated_at = now()
      where id = participant.profile_id
      returning duel_points into new_balance;

      insert into public.duel_point_transactions (
        profile_id,
        amount,
        balance_after,
        reason,
        metadata
      ) values (
        participant.profile_id,
        rule_row.duel_points,
        new_balance,
        'round_participation',
        jsonb_build_object(
          'competition_id', target_competition_id,
          'logical_round_number', logical_round_number,
          'schedule_round_start', block_start,
          'schedule_round_end', block_end,
          'grant_id', new_grant_id
        )
      )
      returning id into new_tx_id;

      update public.competition_round_reward_grants
      set duel_point_transaction_id = new_tx_id
      where id = new_grant_id;
    end if;

    if rule_row.voucher_type is not null
       and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id,
        voucher_type,
        quantity,
        source_type,
        source_id
      ) values (
        participant.profile_id,
        rule_row.voucher_type,
        rule_row.voucher_quantity,
        'round_reward',
        target_competition_id
      );
    end if;
  end loop;

  -- ---------------- placement across the FULL cycle ----------------
  for placement_row in
    with roster as (
      select cp.profile_id
      from public.competition_players cp
      where cp.competition_id = target_competition_id
    ),
    stats as (
      select
        r.profile_id,
        count(*) filter (
          where m.winner_id = r.profile_id
        )::integer as wins,
        count(*) filter (
          where m.winner_id is null
        )::integer as draws,
        coalesce(sum(
          case
            when m.player_one_id = r.profile_id then m.player_one_duel_wins
            when m.player_two_id = r.profile_id then m.player_two_duel_wins
            else 0
          end
        ), 0)::integer as duel_wins,
        coalesce(sum(
          case
            when m.player_one_id = r.profile_id
              then m.player_one_duel_wins - m.player_two_duel_wins
            when m.player_two_id = r.profile_id
              then m.player_two_duel_wins - m.player_one_duel_wins
            else 0
          end
        ), 0)::integer as duel_diff
      from roster r
      left join public.matches m
        on m.competition_id = target_competition_id
       and m.tiebreak_id is null
       and m.round_number between block_start and block_end
       and r.profile_id in (m.player_one_id, m.player_two_id)
      group by r.profile_id
    ),
    ranked as (
      select
        s.*,
        (s.wins * 3 + s.draws)::integer as points,
        row_number() over (
          order by
            (s.wins * 3 + s.draws) desc,
            s.wins desc,
            s.duel_diff desc,
            s.duel_wins desc,
            s.profile_id
        ) as placement
      from stats s
    )
    select *
    from ranked
    where placement <= 3
    order by placement
  loop
    v_reward_role := case placement_row.placement
      when 1 then 'round_winner'
      when 2 then 'round_runner_up'
      when 3 then 'round_third'
      else null
    end;

    v_reward_reason := case placement_row.placement
      when 1 then 'round_winner_bonus'
      when 2 then 'round_runner_up_bonus'
      when 3 then 'round_third_bonus'
      else null
    end;

    if v_reward_role is null then
      continue;
    end if;

    if exists (
      select 1
      from public.competition_round_reward_grants
      where competition_id = target_competition_id
        and round_number = logical_round_number
        and profile_id = placement_row.profile_id
        and competition_round_reward_grants.reward_role = v_reward_role
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_round_reward_rules
    where competition_id = target_competition_id
      and role = v_reward_role;

    if not found then
      continue;
    end if;

    insert into public.competition_round_reward_grants (
      competition_id,
      round_number,
      profile_id,
      reward_role,
      duel_points_granted,
      voucher_type,
      voucher_quantity,
      status
    ) values (
      target_competition_id,
      logical_round_number,
      placement_row.profile_id,
      v_reward_role,
      rule_row.duel_points,
      rule_row.voucher_type,
      rule_row.voucher_quantity,
      'granted'
    )
    returning id into new_grant_id;

    grants_created := grants_created + 1;
    new_tx_id := null;

    if rule_row.duel_points > 0 then
      update public.profiles
      set duel_points = duel_points + rule_row.duel_points,
          updated_at = now()
      where id = placement_row.profile_id
      returning duel_points into new_balance;

      insert into public.duel_point_transactions (
        profile_id,
        amount,
        balance_after,
        reason,
        metadata
      ) values (
        placement_row.profile_id,
        rule_row.duel_points,
        new_balance,
        reward_reason,
        jsonb_build_object(
          'competition_id', target_competition_id,
          'logical_round_number', logical_round_number,
          'schedule_round_start', block_start,
          'schedule_round_end', block_end,
          'placement', placement_row.placement,
          'points', placement_row.points,
          'wins', placement_row.wins,
          'draws', placement_row.draws,
          'duel_diff', placement_row.duel_diff,
          'duel_wins', placement_row.duel_wins,
          'grant_id', new_grant_id
        )
      )
      returning id into new_tx_id;

      update public.competition_round_reward_grants
      set duel_point_transaction_id = new_tx_id
      where id = new_grant_id;
    end if;

    if rule_row.voucher_type is not null
       and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id,
        voucher_type,
        quantity,
        source_type,
        source_id
      ) values (
        placement_row.profile_id,
        rule_row.voucher_type,
        rule_row.voucher_quantity,
        'round_reward',
        target_competition_id
      );
    end if;
  end loop;

  return grants_created;
end;
$function$;

CREATE OR REPLACE FUNCTION public.install_default_competition_rewards_v2(target_competition_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_user_id uuid;
  competition_row public.competitions%rowtype;
  is_admin boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into competition_row
  from public.competitions
  where id = target_competition_id;

  if not found then
    raise exception 'Competition not found.';
  end if;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can install competition reward rules.';
  end if;

  insert into public.competition_reward_rules (
    competition_id,
    placement,
    duel_points,
    voucher_type,
    voucher_quantity
  ) values
    (target_competition_id, 1, 0, null, 0),
    (target_competition_id, 2, 0, null, 0),
    (target_competition_id, 3, 0, null, 0)
  on conflict (competition_id, placement)
  do update set
    duel_points = 0,
    voucher_type = null,
    voucher_quantity = 0;
end;
$function$;

-- ---------------------------------------------------------
-- 7. Rights on functions and tables, as in the migrations.
--    Production never got the lockdown that takes direct write
--    rights on game tables away from signed-in players.
-- ---------------------------------------------------------

revoke execute on function public._credit_duel_points(target_profile_id uuid, target_amount integer, target_reason text, target_match_id uuid, target_note text, target_metadata jsonb) from authenticated;
revoke execute on function public.award_match_duel_points(target_match_id uuid) from public;
revoke execute on function public.consume_reward_voucher(target_voucher_id uuid, target_profile_id uuid) from authenticated;
revoke all on function public.distribute_competition_rewards_v2(target_competition_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.distribute_competition_rewards_v2(target_competition_id uuid) to anon;
grant execute on function public.distribute_competition_rewards_v2(target_competition_id uuid) to authenticated;
grant execute on function public.distribute_competition_rewards_v2(target_competition_id uuid) to service_role;
revoke all on function public.install_default_competition_rewards_v2(target_competition_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.install_default_competition_rewards_v2(target_competition_id uuid) to anon;
grant execute on function public.install_default_competition_rewards_v2(target_competition_id uuid) to authenticated;
grant execute on function public.install_default_competition_rewards_v2(target_competition_id uuid) to service_role;
grant execute on function public.is_league_admin(target_league uuid) to public;
grant execute on function public.roll_shop_pack_rarity(target_pack_code text, minimum_rank integer) to public;
grant execute on function public.shop_card_copy_limit(target_rarity text) to public;
grant execute on function public.shop_rarity_rank(target_rarity text) to public;

revoke delete, insert, update on public.achievement_claims from authenticated;
revoke delete, insert, update on public.achievements from authenticated;
revoke delete, insert, update on public.archetype_cards from authenticated;
revoke delete, insert, update on public.archetype_registry from authenticated;
revoke delete, insert, update on public.audit_log from anon;
revoke delete, insert, update on public.audit_log from authenticated;
revoke delete, insert, update on public.boss_route_achievement_events from authenticated;
revoke delete, insert, update on public.boss_route_achievement_requirements from authenticated;
revoke delete, insert, update on public.boss_route_stage_grants from authenticated;
revoke delete, insert, update on public.boss_route_stages from authenticated;
revoke delete, insert, update on public.boss_routes from authenticated;
revoke delete, insert, update on public.card_catalog from authenticated;
revoke delete, insert, update on public.card_instances from authenticated;
revoke delete, insert, update on public.card_mechanics from authenticated;
revoke delete, insert, update on public.card_synergy_edges from authenticated;
revoke delete, insert, update on public.card_synergy_engine_runs from authenticated;
revoke delete, insert, update on public.card_wishlist_items from authenticated;
revoke delete, insert, update on public.competition_deck_locks from authenticated;
revoke delete, insert, update on public.competition_players from authenticated;
revoke delete, insert, update on public.competition_results from authenticated;
revoke delete, insert, update on public.competition_reward_grants from authenticated;
revoke delete, insert, update on public.competition_reward_rules from authenticated;
revoke delete, insert, update on public.competition_round_reward_grants from authenticated;
revoke delete, insert, update on public.competition_round_reward_rules from authenticated;
revoke delete, insert, update on public.competition_tiebreaks from authenticated;
revoke delete, insert, update on public.competitions from authenticated;
revoke delete, insert, update on public.deck_cards from authenticated;
revoke delete, insert, update on public.decks from authenticated;
revoke delete, insert, update on public.draft_offer_cards from authenticated;
revoke delete, insert, update on public.draft_offers from authenticated;
revoke delete, insert, update on public.draft_picks from authenticated;
revoke delete, insert, update on public.draft_players from authenticated;
revoke delete, insert, update on public.drafts from authenticated;
revoke delete, insert, update on public.duelist_circle_formats from authenticated;
revoke delete, insert, update on public.format_card_overrides from authenticated;
revoke delete, insert, update on public.league_economy_defaults from authenticated;
revoke delete, insert, update on public.matches from authenticated;
revoke delete, insert, update on public.ownership_history from authenticated;
revoke delete, insert, update on public.player_boss_achievement_events from authenticated;
revoke delete, insert, update on public.player_boss_paths from authenticated;
revoke delete, insert, update on public.player_boss_stage_unlocks from authenticated;
revoke update on public.profiles from authenticated;
revoke delete, insert, update on public.shop_special_pack_definitions from authenticated;
revoke delete, insert, update on public.shop_special_pack_pool_cards from authenticated;
revoke delete, insert, update on public.shop_special_pack_slots from authenticated;
revoke delete, insert, update on public.trade_items from authenticated;
revoke delete, insert, update on public.trades from authenticated;
revoke delete, insert, update on public.wallets from authenticated;

-- Revoking update on the whole table also takes the column rights away;
-- players may still edit these profile fields directly.
grant update (accent_theme, avatar_url, bio, boss_monster_option_id, boss_personality, catchphrase, custom_title, duelist_name, favorite_attribute, favorite_card_type, favorite_monster_type, favorite_play_style, profile_banner_url, signature_quote, updated_at) on public.profiles to authenticated;
$drift$;

  raise notice 'prod drift normalize: applied.';
end;
$normalize$;
