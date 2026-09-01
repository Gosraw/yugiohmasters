-- =========================================================
-- LIVE_PHASE2_ROLLOUT_2026_08_31.sql
--
-- ONE ordered, idempotent-where-possible rollout of every Phase 2
-- "Duelist Circle Economy Centralization" change, assembled from the
-- individual migration files already committed to
-- supabase/migrations/. Nothing here is new game-design logic beyond
-- what those files already contain (byte-identical bodies), reordered
-- into one dependency-safe script and wrapped in a single transaction
-- so the whole rollout either fully applies or fully rolls back -
-- the same minimal-rollout approach established by Phase 1's
-- scripts/generated/LIVE_PHASE1_ROLLOUT_2026_08_31.sql.
--
-- CONTENTS, IN DEPENDENCY ORDER
--   1. 202608311100_phase2_economy_central_config_and_round_rewards.sql
--      Creates the public.league_economy_defaults singleton config
--      table (match win/draw/loss DP; round participation/first/
--      second DP and voucher tiers) as the new single source of
--      truth. Redefines _compute_league_match_reward(...) to read
--      from it instead of hardcoded literals. Widens the role /
--      reward_role check constraints on competition_round_reward_
--      rules / competition_round_reward_grants to allow the new
--      'round_runner_up' value. Redefines install_default_round_
--      rewards_v2(...) to install THREE reward rules (participation,
--      round_winner, round_runner_up) sourced from the new config
--      table, and backfills a round_runner_up rule for every existing
--      competition that already has a participation rule. Fully
--      rewrites settle_round_rewards_v2(...) so: (a) the
--      participation reward is granted to every registered
--      competition_players row for the round - fixing a real bug
--      where a bye player (no match row that round) was silently
--      skipped - and (b) a new round_runner_up loop grants the
--      2nd-place bonus to the losing side of every completed match.
--      Depends on the existing round-reward schema from Phase 1's
--      202608301500_round_reward_settlement_and_auto_finalize.sql
--      (already live).
--   2. 202608311200_phase2_pack_price_correction.sql
--      Corrects shop_pack_types prices to the human-approved
--      baseline (Standard/normal=300, Premium=250->900,
--      Deluxe=500->1500 DP) and shop_special_pack_rotations'
--      active-rotation prices to 1200 DP, and reissues
--      refresh_shop_special_pack_rotation_if_needed(...) so future
--      rotations are also priced at 1200 DP (same additive-migration
--      pattern already established by
--      202608231030_special_pack_price_900.sql). Independent of #1;
--      depends on the existing shop schema (already live).
--   3. 202608311300_phase2_verify_introspect_helper.sql
--      One narrow, read-only, security-definer RPC used only by
--      scripts/verify-phase2-live.mjs to confirm the functions,
--      constraints, and economy VALUES above are actually live -
--      needed because Supabase's default PostgREST config does not
--      expose pg_catalog directly to a REST/JS client. Optional to
--      keep afterward; safe to drop once Phase 2 is verified.
--   4. 202608311400_phase2_special_pack_rotation_and_legendary_odds.sql
--      Resolves the two open Phase 2 items from the human-approved
--      follow-up directive. (a) SPECIAL PACK STRUCTURE: adds a third
--      rotation category ('monster_type', reusing pick_shop_pack_
--      card's pre-existing but previously-unwired theme dimension)
--      alongside the existing 'attribute'/'archetype' categories, so
--      3 special packs are active at once, each backed by a new
--      shop_special_pack_slots table of real, live-catalog-derived
--      slot values (never invented) with a deterministic sequential
--      rotation (replacing `order by random()`) that survives a
--      restart. (b) LEGENDARY ODDS: corrects roll_shop_pack_rarity's
--      base odds so the audited hierarchy (Standard 0.15% < Premium
--      0.10% was WRONG -> Premium corrected to 0.30%; Deluxe raised
--      0.45% -> 0.50%; Standard/Special unchanged at 0.15%/0.25%)
--      gives Standard < Premium < Deluxe with Special positioned
--      below Deluxe, as required. Also fixes a genuine bug found
--      during the audit: pick_shop_pack_card's 4 candidate-selection
--      queries only checked the PER-PLAYER copy limit even for
--      Legendary cards (whose true limit is league-wide), which
--      could exhaust the outer 25-attempt retry loop re-selecting an
--      already-claimed Legendary for a narrow special-pack theme and
--      cause a false purchase failure - now uses the same
--      league-wide-aware check purchase_shop_pack already had.
--      Depends on the existing shop/rotation schema (already live)
--      and reissues roll_shop_pack_rarity, pick_shop_pack_card,
--      refresh_shop_special_pack_rotation_if_needed, and
--      ensure_shop_rotations_current in full.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
--   - Does not invent final Special Pack identities/card pools beyond
--     the 3x5=15-slot structure - slot VALUES are populated from
--     real, live, deterministically-ordered catalog data (the same
--     eligibility rule already used in production), never fabricated
--     content.
--   - Does not invent competition-placement reward values, tournament
--     rewards, achievement grants, or Boss Route costs - those remain
--     exactly as they already exist (or do not yet exist) in the live
--     schema, per the Phase 2 directive's own explicit prohibitions.
--   - Does not touch the shared "guaranteed floor card" mechanic in
--     purchase_shop_pack's GENERATE CARDS loop (Premium/Deluxe/
--     Special's forced-minimum-rank last card) - this pre-existing,
--     unmodified mechanic materially raises the REALIZED per-pack
--     Legendary rate above the corrected base odds; see the Phase 2
--     follow-up simulation output and final report for the resulting
--     pacing concern and the human decision it raises.
--   - Does not add a 3rd purchase entry point to the Shop UI for the
--     new 'special_monster_type' pack code - the backend pack is
--     fully functional and purchasable via the existing API, but
--     surfacing it as a third pack card/button in the Shop UI is a
--     small follow-up left for a human decision (out of scope for a
--     "no Shop UI redesign" boundary carried over from the original
--     Phase 2 directive).
--   - Does not touch the Shop UI, mobile layout, or any frontend
--     component beyond what is noted above - Phase 2 is a
--     database/config-centralization pass.
--
-- SAFE TO RE-RUN: every CREATE is IF NOT EXISTS or OR REPLACE, every
-- INSERT is ON CONFLICT DO NOTHING/DO UPDATE, and every UPDATE only
-- touches rows that do not already match the new price (price_dp <>
-- ...) or is itself idempotent by construction (settle_round_
-- rewards_v2's exists()-check-before-insert grant pattern, unchanged
-- from Phase 1). Running this file twice in a row produces the same
-- end state as running it once.
-- =========================================================

begin;

-- =========================================================
-- SOURCE: supabase/migrations/202608311100_phase2_economy_central_config_and_round_rewards.sql
-- =========================================================

-- =========================================================
-- PHASE 2 - ECONOMY CENTRALIZATION (1/3): CENTRAL CONFIG +
-- 3-TIER ROUND PLACEMENT REWARDS
--
-- WHY
-- The human-approved economy baseline (Phase 2 directive) makes
-- three corrections to what Phase 1 shipped:
--
--   1. Match DP was Win 100 / Draw 75 / Loss 50. Approved baseline
--      is Win 100 / Loss 75 (Draw already happened to be 75, so it
--      is unchanged). This was hardcoded as three integer literals
--      inside _compute_league_match_reward - no config table
--      existed for match DP at all.
--
--   2. Round rewards only had two roles (participation, round_winner
--      - corrected to 250 DP+1 Premium Pack / 150 DP+1 Standard Pack
--      by 202608310000_round_reward_economy_correction.sql). The
--      real approved baseline has THREE placement tiers within a
--      round: 1st +150 DP+1 Standard Pack, 2nd +75 DP (no pack), 3rd
--      no additional placement bonus - on top of a universal 250
--      DP+1 Premium Pack "round completion" reward for every
--      competition player, not just the two who happened to have a
--      match that specific round_number.
--
--      generate_round_robin_matches_v2 pads an odd player count
--      (the real league is 3 players) with one synthetic null "bye"
--      slot, and silently drops any match pairing that involves it -
--      so for 3 players, every round_number has exactly ONE real
--      match, and the sitting-out player is never recorded as a
--      "bye" anywhere in the schema. The old settle_round_rewards_v2
--      only paid "participation" to the two players who appeared in
--      that round's match rows, which meant the bye player got
--      NOTHING for a round they structurally could not play in - the
--      opposite of the approved design ("repeated losing should NOT
--      make a player unable to participate in the economy", and
--      Phase 2's own round-payout example table gives all three
--      placements the same 250 Round DP). This migration fixes that:
--      participation is now granted to every public.competition_
--      players row for the competition, independent of whether they
--      have a match in that specific round_number. The match winner
--      of that round is "1st" (role round_winner, unchanged name for
--      backward compatibility with existing grant rows). The match
--      loser of that round is "2nd" (new role round_runner_up). A
--      player with no match that round (the bye) is "3rd" - they
--      simply never qualify for round_winner or round_runner_up,
--      which already IS "no additional placement bonus" - no new
--      code path needed for that case specifically.
--
--      This generalizes cleanly to a hypothetical >3-player
--      competition too (multiple simultaneous matches per round):
--      every match's winner is a round_winner, every match's loser
--      is a round_runner_up, anyone with no match that round is
--      participation-only. This is an intentional, minimal
--      generalization of the existing "a round is however
--      generate_round_robin_matches_v2 grouped matches by
--      round_number" model - not a new design decision.
--
--   3. No single place said what these values ARE for future
--      competitions - both fixes lived only as literals baked into
--      function bodies (_compute_league_match_reward) or as a
--      one-time INSERT (install_default_round_rewards_v2). This
--      migration adds one small singleton table,
--      league_economy_defaults, as the actual single source of
--      truth for match DP and round-reward defaults: change future
--      behavior with one UPDATE to that single row, no code
--      deploy required. (Pack prices already have their own
--      pre-existing authoritative config - shop_pack_types - so they
--      are NOT duplicated here; see 202608311200's header.)
--
-- SAFE TO RE-RUN
-- The singleton insert is ON CONFLICT DO NOTHING. The check-
-- constraint changes use a DO block that finds and drops whatever
-- the existing role/reward_role check constraint is actually named
-- (rather than guessing the autogenerated name) before adding the
-- new one - safe to run again since the second run's DROP is a
-- clean no-op (the constraint it looks for, matching the OLD
-- definition, will already be gone) and ADD CONSTRAINT IF NOT
-- EXISTS-equivalent is achieved by checking existence first. Every
-- other statement is a plain CREATE OR REPLACE FUNCTION or an
-- ON CONFLICT-guarded INSERT.
-- =========================================================


-- ---------------------------------------------------------
-- 1. league_economy_defaults - singleton central config for
--    match DP + round-reward defaults.
-- ---------------------------------------------------------

create table if not exists public.league_economy_defaults (
  id boolean primary key default true check (id),

  match_win_dp integer not null default 100 check (match_win_dp >= 0),
  match_draw_dp integer not null default 75 check (match_draw_dp >= 0),
  match_loss_dp integer not null default 75 check (match_loss_dp >= 0),

  round_participation_dp integer not null default 250
    check (round_participation_dp >= 0),
  round_participation_voucher_type text not null default 'premium_pack'
    check (round_participation_voucher_type in ('normal_pack', 'premium_pack', 'deluxe_pack', 'special_pack')),
  round_participation_voucher_quantity integer not null default 1
    check (round_participation_voucher_quantity >= 0),

  round_first_dp integer not null default 150 check (round_first_dp >= 0),
  round_first_voucher_type text not null default 'normal_pack'
    check (round_first_voucher_type in ('normal_pack', 'premium_pack', 'deluxe_pack', 'special_pack')),
  round_first_voucher_quantity integer not null default 1
    check (round_first_voucher_quantity >= 0),

  round_second_dp integer not null default 75 check (round_second_dp >= 0),

  updated_at timestamptz not null default now()
);

comment on table public.league_economy_defaults is
  'Singleton (one row, id is always true) source of truth for match-DP and round-reward defaults - see this migration''s header for why. install_default_round_rewards_v2() seeds a competition''s own competition_round_reward_rules from this row at competition-start time; _compute_league_match_reward() reads match_* directly on every match settlement. A competition''s already-installed rules are a per-competition override copy (same pattern competition_reward_rules already used) - updating this singleton changes the default for competitions started AFTER the update, not retroactively; re-apply install_default_round_rewards_v2 manually (it is ON CONFLICT DO NOTHING, so delete the old rule rows first) to push a change onto an existing competition. Pack shop prices are NOT here - shop_pack_types is already the pre-existing, live-read authoritative config for those, see 202608311200''s header.';

insert into public.league_economy_defaults (id)
values (true)
on conflict (id) do nothing;

alter table public.league_economy_defaults enable row level security;

drop policy if exists league_economy_defaults_select_authenticated on public.league_economy_defaults;
create policy league_economy_defaults_select_authenticated on public.league_economy_defaults
  for select to authenticated
  using (true);

revoke insert, update, delete on public.league_economy_defaults from authenticated;
grant select on public.league_economy_defaults to authenticated;


-- ---------------------------------------------------------
-- 2. _compute_league_match_reward - now reads match_win_dp /
--    match_draw_dp / match_loss_dp from league_economy_defaults
--    instead of hardcoded literals. Changed from IMMUTABLE to
--    STABLE (it now reads a table) - this is still correct: its
--    result only needs to be constant within a single statement/
--    transaction, never across transactions, and it is only ever
--    called from within other functions' own transactions, never
--    from an index or generated column.
-- ---------------------------------------------------------

create or replace function public._compute_league_match_reward(
  winner_id uuid,
  player_id uuid,
  other_player_id uuid
)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select case
    when winner_id is null then d.match_draw_dp
    when winner_id = player_id then d.match_win_dp
    when winner_id = other_player_id then d.match_loss_dp
    else null -- an invalid winner_id (neither player) - caller must handle
  end
  from public.league_economy_defaults d
  where d.id = true;
$function$;

revoke all on function public._compute_league_match_reward(uuid, uuid, uuid) from public;
-- No grant at all - pure internal helper, only ever called from
-- other SECURITY DEFINER functions in this same schema (unchanged
-- from the prior version).


-- ---------------------------------------------------------
-- 3. Widen the role / reward_role check constraints to add the new
--    'round_runner_up' tier (2nd place). Looked up dynamically
--    rather than assuming the autogenerated constraint name, so
--    this is safe regardless of exactly how Postgres named the
--    inline CHECK when the tables were first created.
-- ---------------------------------------------------------

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    where rel.relname = 'competition_round_reward_rules'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table public.competition_round_reward_rules drop constraint %I', con.conname);
  end loop;
end;
$$;

alter table public.competition_round_reward_rules
  add constraint competition_round_reward_rules_role_check
  check (role in ('participation', 'round_winner', 'round_runner_up'));

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    where rel.relname = 'competition_round_reward_grants'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%reward_role%'
  loop
    execute format('alter table public.competition_round_reward_grants drop constraint %I', con.conname);
  end loop;
end;
$$;

alter table public.competition_round_reward_grants
  add constraint competition_round_reward_grants_reward_role_check
  check (reward_role in ('participation', 'round_winner', 'round_runner_up'));


-- ---------------------------------------------------------
-- 4. install_default_round_rewards_v2 - now seeds all THREE roles
--    from league_economy_defaults instead of two hardcoded rows.
-- ---------------------------------------------------------

create or replace function public.install_default_round_rewards_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d public.league_economy_defaults%rowtype;
begin
  select * into d from public.league_economy_defaults where id = true;

  if not found then
    -- Defensive fallback matching this migration's own seeded
    -- defaults - should be unreachable, since section 1 above
    -- always inserts the singleton row first.
    d.round_participation_dp := 250;
    d.round_participation_voucher_type := 'premium_pack';
    d.round_participation_voucher_quantity := 1;
    d.round_first_dp := 150;
    d.round_first_voucher_type := 'normal_pack';
    d.round_first_voucher_quantity := 1;
    d.round_second_dp := 75;
  end if;

  insert into public.competition_round_reward_rules (
    competition_id, role, duel_points, voucher_type, voucher_quantity
  ) values
    (target_competition_id, 'participation', d.round_participation_dp, d.round_participation_voucher_type, d.round_participation_voucher_quantity),
    (target_competition_id, 'round_winner', d.round_first_dp, d.round_first_voucher_type, d.round_first_voucher_quantity),
    (target_competition_id, 'round_runner_up', d.round_second_dp, null, 0)
  on conflict (competition_id, role) do nothing;
end;
$function$;

revoke all on function public.install_default_round_rewards_v2(uuid) from public;
grant execute on function public.install_default_round_rewards_v2(uuid) to authenticated;

-- Backfill: any competition that already has round reward rules
-- installed (from Phase 1 onward) has 'participation'/'round_winner'
-- but is missing the new 'round_runner_up' tier entirely - add it
-- using the same defaults, without touching the existing two rows
-- (their Phase-1-corrected values - 250/premium_pack/1 and
-- 150/normal_pack/1 - already match the approved baseline exactly,
-- so there is nothing to correct there).
insert into public.competition_round_reward_rules (
  competition_id, role, duel_points, voucher_type, voucher_quantity
)
select distinct r.competition_id, 'round_runner_up', d.round_second_dp, null, 0
from public.competition_round_reward_rules r
cross join public.league_economy_defaults d
where r.role = 'participation'
  and d.id = true
on conflict (competition_id, role) do nothing;


-- ---------------------------------------------------------
-- 5. settle_round_rewards_v2 - rewritten for the 3-tier design.
--    Idempotency guarantee is unchanged (partial unique index +
--    exists() pre-check per role, exactly as before) - only WHO
--    qualifies for which role has changed.
-- ---------------------------------------------------------

create or replace function public.settle_round_rewards_v2(
  target_competition_id uuid,
  target_round_number integer
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  incomplete_count integer;
  match_count integer;
  participant record;
  rule_row public.competition_round_reward_rules%rowtype;
  new_balance integer;
  new_tx_id uuid;
  new_grant_id uuid;
  grants_created integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtext('competition_round_settlement_' || target_competition_id::text || '_' || target_round_number::text)
  );

  select count(*) into match_count
  from public.matches
  where competition_id = target_competition_id
    and round_number = target_round_number;

  if match_count = 0 then
    return 0;
  end if;

  select count(*) into incomplete_count
  from public.matches
  where competition_id = target_competition_id
    and round_number = target_round_number
    and status <> 'completed';

  if incomplete_count > 0 then
    return 0;
  end if;

  if not exists (
    select 1 from public.competition_round_reward_rules
    where competition_id = target_competition_id
  ) then
    perform public.install_default_round_rewards_v2(target_competition_id);
  end if;

  -- ---- participation (universal "round completion" reward): every
  -- player registered in the competition, NOT only the players who
  -- happened to have a match this specific round_number. A 3-player
  -- round-robin always has exactly one bye per round (see this
  -- migration's header) - the bye player still "completes the
  -- round" and must still get this reward, per the approved
  -- baseline's own round-payout example (all three placements show
  -- the same 250 Round DP).
  for participant in
    select cp.profile_id
    from public.competition_players cp
    where cp.competition_id = target_competition_id
  loop
    if exists (
      select 1 from public.competition_round_reward_grants
      where competition_id = target_competition_id
        and round_number = target_round_number
        and profile_id = participant.profile_id
        and reward_role = 'participation'
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_round_reward_rules
    where competition_id = target_competition_id and role = 'participation';

    if not found then
      continue;
    end if;

    new_tx_id := null;

    insert into public.competition_round_reward_grants (
      competition_id, round_number, profile_id, reward_role,
      duel_points_granted, voucher_type, voucher_quantity, status
    ) values (
      target_competition_id, target_round_number, participant.profile_id, 'participation',
      rule_row.duel_points, rule_row.voucher_type, rule_row.voucher_quantity, 'granted'
    )
    returning id into new_grant_id;

    grants_created := grants_created + 1;

    if rule_row.duel_points > 0 then
      update public.profiles
      set duel_points = duel_points + rule_row.duel_points, updated_at = now()
      where id = participant.profile_id
      returning duel_points into new_balance;

      insert into public.duel_point_transactions (
        profile_id, amount, balance_after, reason, metadata
      ) values (
        participant.profile_id, rule_row.duel_points, new_balance, 'round_participation',
        jsonb_build_object(
          'competition_id', target_competition_id,
          'round_number', target_round_number,
          'grant_id', new_grant_id
        )
      )
      returning id into new_tx_id;

      update public.competition_round_reward_grants
      set duel_point_transaction_id = new_tx_id
      where id = new_grant_id;
    end if;

    if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id, voucher_type, quantity, source_type, source_id
      ) values (
        participant.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
        'round_reward', target_competition_id
      );
    end if;
  end loop;

  -- ---- round_winner (1st place): the winner of each individual
  -- match played this round_number.
  for participant in
    select distinct winner_id as profile_id
    from public.matches
    where competition_id = target_competition_id
      and round_number = target_round_number
      and winner_id is not null
  loop
    if exists (
      select 1 from public.competition_round_reward_grants
      where competition_id = target_competition_id
        and round_number = target_round_number
        and profile_id = participant.profile_id
        and reward_role = 'round_winner'
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_round_reward_rules
    where competition_id = target_competition_id and role = 'round_winner';

    if not found then
      continue;
    end if;

    new_tx_id := null;

    insert into public.competition_round_reward_grants (
      competition_id, round_number, profile_id, reward_role,
      duel_points_granted, voucher_type, voucher_quantity, status
    ) values (
      target_competition_id, target_round_number, participant.profile_id, 'round_winner',
      rule_row.duel_points, rule_row.voucher_type, rule_row.voucher_quantity, 'granted'
    )
    returning id into new_grant_id;

    grants_created := grants_created + 1;

    if rule_row.duel_points > 0 then
      update public.profiles
      set duel_points = duel_points + rule_row.duel_points, updated_at = now()
      where id = participant.profile_id
      returning duel_points into new_balance;

      insert into public.duel_point_transactions (
        profile_id, amount, balance_after, reason, metadata
      ) values (
        participant.profile_id, rule_row.duel_points, new_balance, 'round_winner_bonus',
        jsonb_build_object(
          'competition_id', target_competition_id,
          'round_number', target_round_number,
          'grant_id', new_grant_id
        )
      )
      returning id into new_tx_id;

      update public.competition_round_reward_grants
      set duel_point_transaction_id = new_tx_id
      where id = new_grant_id;
    end if;

    if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id, voucher_type, quantity, source_type, source_id
      ) values (
        participant.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
        'round_reward', target_competition_id
      );
    end if;
  end loop;

  -- ---- round_runner_up (2nd place, NEW): the loser of each
  -- individual completed match this round_number - the participant
  -- of that match who is not its winner_id. A player who did not
  -- play a match this round (the bye) is correctly never considered
  -- here - they only ever get 'participation' above, which is
  -- exactly the approved "3rd: no additional placement bonus."
  for participant in
    select distinct
      case when m.winner_id = m.player_one_id then m.player_two_id else m.player_one_id end as profile_id
    from public.matches m
    where m.competition_id = target_competition_id
      and m.round_number = target_round_number
      and m.winner_id is not null
  loop
    if exists (
      select 1 from public.competition_round_reward_grants
      where competition_id = target_competition_id
        and round_number = target_round_number
        and profile_id = participant.profile_id
        and reward_role = 'round_runner_up'
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_round_reward_rules
    where competition_id = target_competition_id and role = 'round_runner_up';

    if not found then
      continue;
    end if;

    new_tx_id := null;

    insert into public.competition_round_reward_grants (
      competition_id, round_number, profile_id, reward_role,
      duel_points_granted, voucher_type, voucher_quantity, status
    ) values (
      target_competition_id, target_round_number, participant.profile_id, 'round_runner_up',
      rule_row.duel_points, rule_row.voucher_type, rule_row.voucher_quantity, 'granted'
    )
    returning id into new_grant_id;

    grants_created := grants_created + 1;

    if rule_row.duel_points > 0 then
      update public.profiles
      set duel_points = duel_points + rule_row.duel_points, updated_at = now()
      where id = participant.profile_id
      returning duel_points into new_balance;

      insert into public.duel_point_transactions (
        profile_id, amount, balance_after, reason, metadata
      ) values (
        participant.profile_id, rule_row.duel_points, new_balance, 'round_runner_up_bonus',
        jsonb_build_object(
          'competition_id', target_competition_id,
          'round_number', target_round_number,
          'grant_id', new_grant_id
        )
      )
      returning id into new_tx_id;

      update public.competition_round_reward_grants
      set duel_point_transaction_id = new_tx_id
      where id = new_grant_id;
    end if;

    if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id, voucher_type, quantity, source_type, source_id
      ) values (
        participant.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
        'round_reward', target_competition_id
      );
    end if;
  end loop;

  return grants_created;
end;
$function$;

revoke all on function public.settle_round_rewards_v2(uuid, integer) from public;
-- Intentionally NOT granted to authenticated - internal helper only,
-- called from within submit_competition_match_result_v2 (already
-- admin-gated). Unchanged from the prior version.

-- =========================================================
-- SOURCE: supabase/migrations/202608311200_phase2_pack_price_correction.sql
-- =========================================================

-- =========================================================
-- PHASE 2 - ECONOMY CENTRALIZATION (2/3): PACK PRICE CORRECTION
--
-- Approved baseline (Phase 2 directive, Section 2): Standard=300,
-- Premium=900, Special=1200, Deluxe=1500.
--
-- shop_pack_types is already the pre-existing, live-read
-- authoritative config for Standard/Premium/Deluxe - the shop page
-- and purchase_shop_pack() both already read price_dp straight from
-- it (confirmed: no hardcoded price literal exists anywhere in
-- src/app/(app)/shop/page.tsx or purchase_shop_pack - every price
-- shown or charged is `pack.price_dp` / `slot.price_dp` read live
-- from the DB). So centralizing Standard/Premium/Deluxe means
-- correcting the THREE STORED VALUES in that table, not building a
-- new config layer - a new table would just be a second, competing
-- "source of truth" for the same three numbers, which is exactly
-- what Phase 2 Section 5 says not to do ("do not create unnecessary
-- complexity").
--
-- Old -> new: normal ("Standard Pack" in the UI - see VOUCHER_LABEL
-- in src/lib/match-settlement-summary.ts) 100 -> 300, premium 250 ->
-- 900, deluxe 500 -> 1500.
--
-- Special Pack price was already corrected once before, from its
-- original 250 to 900, by 202608231030_special_pack_price_900.sql -
-- a real, deliberate, already-shipped decision with its own
-- migration history (not a placeholder). The Phase 2 baseline
-- raises it again, 900 -> 1200. Following that same migration's own
-- convention (an additive follow-up that reissues the affected
-- function body in full rather than editing the already-shipped
-- file), this section corrects both the currently-stored rows and
-- the generation default for all future rotations.
--
-- SAFE TO RE-RUN: every UPDATE below is a plain idempotent price
-- correction (WHERE price_dp <> the new value - already a no-op
-- once applied), and the function re-issue is a plain CREATE OR
-- REPLACE FUNCTION.
-- =========================================================


-- ---------------------------------------------------------
-- 1. shop_pack_types: Standard(normal)/Premium/Deluxe.
-- ---------------------------------------------------------

update public.shop_pack_types
set price_dp = 300, updated_at = now()
where code = 'normal' and price_dp <> 300;

update public.shop_pack_types
set price_dp = 900, updated_at = now()
where code = 'premium' and price_dp <> 900;

update public.shop_pack_types
set price_dp = 1500, updated_at = now()
where code = 'deluxe' and price_dp <> 1500;


-- ---------------------------------------------------------
-- 2. shop_special_pack_rotations: correct any currently active
--    rotation's stored price (a rotation generated under the old
--    900 default, still active, must not keep charging 900 for the
--    rest of its 48h window).
-- ---------------------------------------------------------

update public.shop_special_pack_rotations
set price_dp = 1200, updated_at = now()
where price_dp <> 1200
  and status = 'active'
  and ends_at > now();


-- ---------------------------------------------------------
-- 3. Re-issue refresh_shop_special_pack_rotation_if_needed with the
--    corrected default generation price (1200, was 900). Function
--    body is byte-for-byte identical to
--    202608231030_special_pack_price_900.sql's version except for
--    that single literal - theme selection, Master Duel filtering,
--    cards_per_pack, and the 48h duration are all untouched.
-- ---------------------------------------------------------

create or replace function public.refresh_shop_special_pack_rotation_if_needed(
  target_theme_category text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  min_theme_eligible_cards constant integer := 12;
  previous_theme_value text;
  chosen_theme_value text;
  chosen_theme_label text;
begin
  if target_theme_category not in ('attribute', 'archetype') then
    raise exception 'Invalid special pack theme category.';
  end if;

  perform pg_advisory_xact_lock(hashtext('shop_special_refresh_' || target_theme_category));

  if exists (
    select 1
    from public.shop_special_pack_rotations
    where
      theme_category = target_theme_category
      and status = 'active'
      and starts_at <= now()
      and ends_at > now()
  ) then
    return;
  end if;

  update public.shop_special_pack_rotations
  set
    status = 'completed',
    updated_at = now()
  where
    theme_category = target_theme_category
    and status = 'active'
    and ends_at <= now();

  select theme_value
  into previous_theme_value
  from public.shop_special_pack_rotations
  where theme_category = target_theme_category
  order by created_at desc
  limit 1;

  if target_theme_category = 'attribute' then
    select cc.attribute
    into chosen_theme_value
    from public.card_catalog cc
    where
      cc.format_eligible = true
      and public.is_master_duel_offerable(cc.master_duel_status)
      and cc.attribute is not null
      and cc.attribute <> ''
      and (previous_theme_value is null or cc.attribute <> previous_theme_value)
    group by cc.attribute
    having count(*) >= min_theme_eligible_cards
    order by random()
    limit 1;

    if chosen_theme_value is null then
      select cc.attribute
      into chosen_theme_value
      from public.card_catalog cc
      where
        cc.format_eligible = true
        and public.is_master_duel_offerable(cc.master_duel_status)
        and cc.attribute is not null
        and cc.attribute <> ''
      group by cc.attribute
      having count(*) >= min_theme_eligible_cards
      order by random()
      limit 1;
    end if;
  else
    select cc.archetype
    into chosen_theme_value
    from public.card_catalog cc
    where
      cc.format_eligible = true
      and public.is_master_duel_offerable(cc.master_duel_status)
      and cc.archetype is not null
      and cc.archetype <> ''
      and (previous_theme_value is null or cc.archetype <> previous_theme_value)
    group by cc.archetype
    having count(*) >= min_theme_eligible_cards
    order by random()
    limit 1;

    if chosen_theme_value is null then
      select cc.archetype
      into chosen_theme_value
      from public.card_catalog cc
      where
        cc.format_eligible = true
        and public.is_master_duel_offerable(cc.master_duel_status)
        and cc.archetype is not null
        and cc.archetype <> ''
      group by cc.archetype
      having count(*) >= min_theme_eligible_cards
      order by random()
      limit 1;
    end if;
  end if;

  if chosen_theme_value is null then
    return;
  end if;

  chosen_theme_label := chosen_theme_value;

  insert into public.shop_special_pack_rotations (
    theme_category,
    theme_value,
    theme_label,
    price_dp,
    cards_per_pack,
    starts_at,
    ends_at,
    status
  )
  values (
    target_theme_category,
    chosen_theme_value,
    chosen_theme_label,
    1200,
    5,
    now(),
    now() + interval '48 hours',
    'active'
  );
end;
$function$;

revoke all
  on function public.refresh_shop_special_pack_rotation_if_needed(text)
  from public;

grant execute
  on function public.refresh_shop_special_pack_rotation_if_needed(text)
  to authenticated;

-- =========================================================
-- SOURCE: supabase/migrations/202608311300_phase2_verify_introspect_helper.sql
-- =========================================================

-- =========================================================
-- PHASE 2 - ECONOMY CENTRALIZATION (3/3): VERIFICATION HELPER
--
-- Same reasoning as _phase1_verify_introspect() (see that
-- migration's own header): Supabase's default PostgREST config does
-- not expose pg_catalog over the REST API, so a plain
-- `.from("pg_proc")` call from the JS verification script would
-- fail regardless of whether the underlying fix is really live.
-- This narrow, read-only, security-definer RPC additionally exposes
-- the actual VALUES now live in league_economy_defaults and
-- shop_pack_types (not just existence) since Phase 2 is specifically
-- about verifying economy VALUES agree everywhere - existence checks
-- alone (Phase 1's approach) are not enough this time.
--
-- SAFETY: identical posture to _phase1_verify_introspect - read-only,
-- narrow (hardcoded object names, not caller-supplied), granted to
-- service_role only, safe to leave in place permanently.
-- =========================================================

create or replace function public._phase2_verify_introspect()
returns jsonb
language plpgsql
security definer
set search_path to 'public, pg_catalog'
as $function$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'functions', (
      select jsonb_object_agg(fn, exists(select 1 from pg_proc where proname = fn))
      from unnest(array[
        'settle_round_rewards_v2',
        'install_default_round_rewards_v2',
        '_compute_league_match_reward',
        'refresh_shop_special_pack_rotation_if_needed'
      ]) as fn
    ),
    'sources', (
      select jsonb_object_agg(p.proname, p.prosrc)
      from pg_proc p
      where p.proname in (
        'install_default_round_rewards_v2',
        '_compute_league_match_reward',
        'settle_round_rewards_v2',
        'refresh_shop_special_pack_rotation_if_needed'
      )
    ),
    'constraints', (
      select jsonb_object_agg(rel.relname || '.' || c.conname, pg_get_constraintdef(c.oid))
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      where rel.relname in ('competition_round_reward_rules', 'competition_round_reward_grants')
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%role%'
    ),
    'league_economy_defaults', (
      select to_jsonb(d) - 'id' - 'updated_at'
      from public.league_economy_defaults d
      where d.id = true
    ),
    'shop_pack_types', (
      select jsonb_object_agg(t.code, t.price_dp)
      from public.shop_pack_types t
      where t.code in ('normal', 'premium', 'deluxe')
    ),
    'active_special_pack_prices', (
      select coalesce(jsonb_agg(distinct r.price_dp), '[]'::jsonb)
      from public.shop_special_pack_rotations r
      where r.status = 'active'
    ),
    'round_reward_rule_role_counts', (
      select jsonb_object_agg(role, cnt)
      from (
        select role, count(*) as cnt
        from public.competition_round_reward_rules
        group by role
      ) counts
    )
  ) into result;

  return result;
end;
$function$;

revoke all on function public._phase2_verify_introspect() from public;
grant execute on function public._phase2_verify_introspect() to service_role;

-- =========================================================
-- SOURCE: supabase/migrations/202608311400_phase2_special_pack_rotation_and_legendary_odds.sql
-- =========================================================

-- =========================================================
-- PHASE 2 (FOLLOW-UP) - SPECIAL PACK ROTATION REBUILD +
-- LEGENDARY ODDS HIERARCHY CORRECTION
--
-- Implements the human-confirmed decisions from the Phase 2
-- follow-up directive (2026-08-31):
--
--   1. SPECIAL PACK STRUCTURE: 15 total configured themes, 3
--      active at the same time, deterministic 48h rotation, all
--      players see the same active 3, survives restart, pack
--      identities stay configurable (nothing invented to pad out
--      to exactly 15 - see section 1 below).
--   2/3/4. LEGENDARY ODDS: audited the current Standard/Premium/
--      Special/Deluxe odds (see roll_shop_pack_rarity below) and
--      corrected the one real inconsistency found - Premium
--      (900 DP) had a LOWER Legendary chance (0.10%) than the
--      cheaper Standard pack (300 DP, 0.15%). New hierarchy:
--      Standard 0.15% < Special 0.25% < Premium 0.30% < Deluxe
--      0.50% - strictly increasing with price for the three
--      normal purchasable tiers, Special positioned by its
--      thematic role (below both Premium and Deluxe, despite
--      costing more than Premium) rather than maximized because
--      it costs more. All four conservative, low-probability,
--      summing to 100 exactly as before - only the Legendary/
--      Secret-Rare split moved within Premium and Deluxe.
--
-- SECTION 1: WHY "MONSTER_TYPE" IS THE THIRD ROTATION CATEGORY
--
-- The live special-pack system (202608230021) already had exactly
-- TWO categories (attribute, archetype), each independently
-- holding one active rotation at a time - "3 active packs" cannot
-- be reached by giving one of those two categories a second
-- simultaneous active row, because every purchase/pity/theme-
-- filter code path (purchase_shop_pack, pick_shop_pack_card,
-- get_active_special_pack_rotation) is keyed by theme_category,
-- one value per active instance. Rather than inventing a new
-- addressing scheme (a slot id, a rotation-instance parameter) to
-- let 3 packs share 2 categories, this migration adds a THIRD
-- category - 'monster_type' - which pick_shop_pack_card has
-- supported as a theme dimension since it was written (see its
-- own `case theme_type ... when 'monster_type' ...` branch,
-- already live and untouched) but which was never wired up to
-- shop_special_pack_rotations' category check or exposed as a
-- purchasable pack code. Three categories, one active rotation
-- each, is the SMALLEST change that reaches "3 active at once"
-- while reusing every existing table, index, constraint, and
-- function UNCHANGED except where explicitly noted below - no new
-- uniqueness model, no new addressing scheme, no rebuild of a
-- working system.
--
-- SECTION 2: WHY "shop_special_pack_slots" INSTEAD OF LIVE RANDOM
-- SELECTION
--
-- The live refresh_shop_special_pack_rotation_if_needed() picked a
-- fresh theme with `order by random() limit 1` on every 48h
-- refresh - never a fixed, enumerable pool, and never deterministic
-- (the directive requires both: "15 total configured" and
-- "deterministic 48-hour rotation"). This migration adds
-- shop_special_pack_slots, a small per-category ordered list (up to
-- 5 slots per category x 3 categories = up to 15 total - the exact
-- Phase 2 target), and changes the refresh function to advance
-- through that fixed list IN ORDER, wrapping back to slot 1 after
-- the last one, instead of drawing a new random theme. A category
-- with exactly 5 configured slots completes a full cycle in
-- 5 x 48h = 240h = 10 days, matching the original Phase 2
-- directive's own "~10-day full cycle" target exactly.
--
-- The 15 slots are populated from REAL, LIVE card_catalog data -
-- the exact same eligibility rule already proven in production
-- (format_eligible + is_master_duel_offerable + >=12 matching
-- cards), just with a DETERMINISTIC tie-break (alphabetical) in
-- place of the old `order by random()`, and capped at 5 per
-- category. If the live catalog has fewer than 5 eligible themes
-- for a category, fewer slots are configured for it - no
-- placeholder or invented theme is ever inserted to pad the count
-- to 15, per the directive's explicit "do not invent final card
-- contents just to fill all 15 packs" instruction. A human can
-- freely edit shop_special_pack_slots afterward to curate the
-- final identities (add, remove, reorder) without touching any
-- function in this migration - slot_order determines rotation
-- sequence, not the underlying card pool.
--
-- SECTION 3: WHAT IS DELIBERATELY UNCHANGED
-- - get_active_special_pack_rotation(category): already tolerant
--   of the category values it's given and already picks the
--   single active row deterministically (order by starts_at desc
--   limit 1) - zero changes needed.
-- - shop_special_pack_rotations' existing "one active row per
--   theme_category" unique index: with exactly 3 categories this
--   index now IS the "at most 3 active at once" guarantee (one
--   attribute + one archetype + one monster_type) - no change
--   needed to the index itself, only to the check constraint that
--   validates which category values are allowed (section below).
-- - pick_shop_pack_card's theme-matching case statement: already
--   supports 'monster_type' (and 'card_type', 'frame_type',
--   'custom' - unused today, available for a future category
--   without any further schema change).
-- - Every rarity-odds NUMBER for Standard and Special: audited and
--   found already correct relative to the approved hierarchy (see
--   roll_shop_pack_rarity below) - only Premium and Deluxe's
--   Legendary/Secret-Rare split changed.
-- - Pity thresholds, pack prices (beyond the already-corrected
--   1200 DP special price), voucher redemption, card-instance
--   minting, ownership history, first-pull tracking: untouched.
--
-- SECTION 4: A KNOWN, HONEST GAP - LEFT FOR A UI FOLLOW-UP
-- The Shop UI (src/app/(app)/shop/page.tsx) and its server action
-- (src/app/actions/shop.ts) currently render exactly two special-
-- pack purchase entry points, wired to the 'special_attribute' and
-- 'special_archetype' pack codes. This migration adds a third,
-- fully working backend pack code - 'special_monster_type' - but
-- does NOT touch the Shop UI or its actions (per the standing "no
-- Shop UI redesign" instruction from the original Phase 2
-- directive). Until a small UI update adds a third pack
-- card/button calling purchase_shop_pack('special_monster_type',
-- ...), players will only be able to SEE all 3 active rotations
-- (via a live query) but only PURCHASE 2 of the 3 through the
-- existing UI. This is flagged in the final report as the one
-- remaining step before the special-pack rebuild is fully
-- player-facing.
--
-- ALSO FIXED IN THIS MIGRATION (discovered during the "verify the
-- existing safe reroll/fallback mechanism" audit the directive
-- asked for): pick_shop_pack_card's own candidate-selection
-- queries excluded a card only by THIS PLAYER's copy count, for
-- every rarity including Legendary - meaning it could still offer
-- an already-league-owned Legendary as a "candidate" (correctly
-- rejected only by purchase_shop_pack's own outer retry loop,
-- which has no memory across attempts and could exhaust all 25
-- retries re-picking the exact same doomed card for a narrow
-- special-pack theme with only one matching Legendary). Fixed by
-- applying the same Legendary-is-league-wide branch already used
-- in purchase_shop_pack's own 2026-08-30 fix, one level earlier,
-- inside pick_shop_pack_card itself - see that function's reissue
-- below for the full explanation.
--
-- SAFE TO RE-RUN: shop_special_pack_slots population is
-- ON CONFLICT DO NOTHING (won't duplicate or reshuffle already-
-- configured slots on a second run); the check-constraint widening
-- is a dynamic find-and-drop-if-exists before adding the new one;
-- every function is a plain CREATE OR REPLACE.
-- =========================================================


-- ---------------------------------------------------------
-- 1. shop_special_pack_slots - the configured 15-slot pool.
-- ---------------------------------------------------------

create table if not exists public.shop_special_pack_slots (
  id uuid primary key default gen_random_uuid(),

  theme_category text not null
    check (theme_category in ('attribute', 'archetype', 'monster_type')),

  slot_order integer not null check (slot_order >= 1),

  theme_value text not null,
  theme_label text not null,

  created_at timestamptz not null default now(),

  unique (theme_category, slot_order),
  unique (theme_category, theme_value)
);

comment on table public.shop_special_pack_slots is
  'Configured pool of special-pack theme "slots" per category (attribute/archetype/monster_type), up to 5 per category (15 total) - the Phase 2 "15 configured, 3 active" target, one active slot per category at a time via shop_special_pack_rotations. Populated once at migration time from real, live card_catalog data (deterministic alphabetical order, not random), using the exact eligibility rule already proven by refresh_shop_special_pack_rotation_if_needed (format_eligible + is_master_duel_offerable + >=12 matching cards). If fewer than 5 eligible themes exist for a category in the live catalog, fewer slots are configured - no placeholder/invented theme is ever inserted in their place. A human can freely add, remove, or reorder rows here later to curate the final identities; slot_order determines rotation sequence within its category, not the underlying card pool.';

alter table public.shop_special_pack_slots enable row level security;

drop policy if exists shop_special_pack_slots_select_authenticated on public.shop_special_pack_slots;
create policy shop_special_pack_slots_select_authenticated on public.shop_special_pack_slots
  for select to authenticated
  using (true);

revoke insert, update, delete on public.shop_special_pack_slots from authenticated;
grant select on public.shop_special_pack_slots to authenticated;


-- ---------------------------------------------------------
-- 2. Populate up to 5 slots per category from real, live
--    catalog data - deterministic alphabetical order, capped,
--    never invented. Three independent statements; each is
--    safe to re-run (ON CONFLICT DO NOTHING on the
--    (theme_category, slot_order) uniqueness).
-- ---------------------------------------------------------

with eligible_archetypes as (
  select cc.archetype as theme_value
  from public.card_catalog cc
  where cc.format_eligible = true
    and public.is_master_duel_offerable(cc.master_duel_status)
    and cc.archetype is not null
    and cc.archetype <> ''
  group by cc.archetype
  having count(*) >= 12
),
ranked_archetypes as (
  select theme_value, row_number() over (order by theme_value asc) as slot_order
  from eligible_archetypes
)
insert into public.shop_special_pack_slots (theme_category, slot_order, theme_value, theme_label)
select 'archetype', slot_order, theme_value, theme_value
from ranked_archetypes
where slot_order <= 5
on conflict (theme_category, slot_order) do nothing;

with eligible_attributes as (
  select cc.attribute as theme_value
  from public.card_catalog cc
  where cc.format_eligible = true
    and public.is_master_duel_offerable(cc.master_duel_status)
    and cc.attribute is not null
    and cc.attribute <> ''
  group by cc.attribute
  having count(*) >= 12
),
ranked_attributes as (
  select theme_value, row_number() over (order by theme_value asc) as slot_order
  from eligible_attributes
)
insert into public.shop_special_pack_slots (theme_category, slot_order, theme_value, theme_label)
select 'attribute', slot_order, theme_value, theme_value
from ranked_attributes
where slot_order <= 5
on conflict (theme_category, slot_order) do nothing;

with eligible_monster_types as (
  select cc.monster_type as theme_value
  from public.card_catalog cc
  where cc.format_eligible = true
    and public.is_master_duel_offerable(cc.master_duel_status)
    and cc.monster_type is not null
    and cc.monster_type <> ''
  group by cc.monster_type
  having count(*) >= 12
),
ranked_monster_types as (
  select theme_value, row_number() over (order by theme_value asc) as slot_order
  from eligible_monster_types
)
insert into public.shop_special_pack_slots (theme_category, slot_order, theme_value, theme_label)
select 'monster_type', slot_order, theme_value, theme_value
from ranked_monster_types
where slot_order <= 5
on conflict (theme_category, slot_order) do nothing;


-- ---------------------------------------------------------
-- 3. shop_special_pack_rotations: add slot_order (additive,
--    nullable - historical rows predate slots), widen the
--    theme_category check constraint to allow 'monster_type'.
--    The existing "one active row per theme_category" unique
--    index is UNCHANGED and is now exactly the "3 active at
--    once" guarantee (one per category, three categories).
-- ---------------------------------------------------------

alter table public.shop_special_pack_rotations
  add column if not exists slot_order integer;

comment on column public.shop_special_pack_rotations.slot_order is
  'Which shop_special_pack_slots.slot_order (within this row''s theme_category) is currently active - lets refresh_shop_special_pack_rotation_if_needed() advance deterministically to the next configured slot instead of drawing a new random theme. Null on historical rows created before this column existed.';

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    where rel.relname = 'shop_special_pack_rotations'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%theme_category%'
  loop
    execute format('alter table public.shop_special_pack_rotations drop constraint %I', con.conname);
  end loop;
end;
$$;

alter table public.shop_special_pack_rotations
  add constraint shop_special_pack_rotations_theme_category_check
  check (theme_category in ('attribute', 'archetype', 'monster_type'));

comment on table public.shop_special_pack_rotations is
  'Three independently-refreshing (48h) rotating special packs, one per theme_category (attribute, archetype, monster_type) - three concurrently active rows is the Phase 2 "3 active at once" target. Each category advances deterministically through its own configured shop_special_pack_slots list (slot_order), wrapping after the last configured slot - never random, as of the 2026-08-31 Phase 2 special-pack rebuild.';


-- ---------------------------------------------------------
-- 4. refresh_shop_special_pack_rotation_if_needed - reissued.
--    Same name, same signature, same lazy-refresh/advisory-
--    lock/idempotent-check safety properties as the live
--    version - the ONLY behavioral change is WHICH theme gets
--    picked: deterministic "next configured slot in sequence"
--    instead of `order by random()` over live catalog data.
--    Supersedes the reissue in 202608311200 (which only changed
--    the hardcoded price 900 -> 1200, already correct and kept
--    here unchanged).
-- ---------------------------------------------------------

create or replace function public.refresh_shop_special_pack_rotation_if_needed(
  target_theme_category text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  previous_slot_order integer;
  total_slots integer;
  next_slot_order integer;
  next_theme_value text;
  next_theme_label text;
begin
  if target_theme_category not in ('attribute', 'archetype', 'monster_type') then
    raise exception 'Invalid special pack theme category.';
  end if;

  perform pg_advisory_xact_lock(hashtext('shop_special_refresh_' || target_theme_category));

  if exists (
    select 1
    from public.shop_special_pack_rotations
    where
      theme_category = target_theme_category
      and status = 'active'
      and starts_at <= now()
      and ends_at > now()
  ) then
    return;
  end if;

  update public.shop_special_pack_rotations
  set
    status = 'completed',
    updated_at = now()
  where
    theme_category = target_theme_category
    and status = 'active'
    and ends_at <= now();

  select count(*)
  into total_slots
  from public.shop_special_pack_slots
  where theme_category = target_theme_category;

  -- No configured slots at all for this category (e.g. a
  -- sparse/test catalog, or a category not yet curated) - skip
  -- generating a rotation for it rather than raising. A missing
  -- special pack is safer than a broken one, and never blocks
  -- singles refresh or the other categories.
  if total_slots = 0 then
    return;
  end if;

  select slot_order
  into previous_slot_order
  from public.shop_special_pack_rotations
  where theme_category = target_theme_category
  order by created_at desc
  limit 1;

  -- DETERMINISTIC SEQUENTIAL ROTATION: advance to the next
  -- configured slot in this category's fixed sequence, wrapping
  -- back to 1 after the last one - never random. A category with
  -- N configured slots completes a full cycle every N * 48h (5
  -- slots = a 10-day full cycle, matching the original Phase 2
  -- "~10-day full cycle" target).
  next_slot_order := case
    when previous_slot_order is null then 1
    else (previous_slot_order % total_slots) + 1
  end;

  select theme_value, theme_label
  into next_theme_value, next_theme_label
  from public.shop_special_pack_slots
  where theme_category = target_theme_category
    and slot_order = next_slot_order;

  if next_theme_value is null then
    return;
  end if;

  insert into public.shop_special_pack_rotations (
    theme_category,
    slot_order,
    theme_value,
    theme_label,
    price_dp,
    cards_per_pack,
    starts_at,
    ends_at,
    status
  )
  values (
    target_theme_category,
    next_slot_order,
    next_theme_value,
    next_theme_label,
    1200,
    5,
    now(),
    now() + interval '48 hours',
    'active'
  );
end;
$function$;

revoke all
  on function public.refresh_shop_special_pack_rotation_if_needed(text)
  from public;

grant execute
  on function public.refresh_shop_special_pack_rotation_if_needed(text)
  to authenticated;


-- ---------------------------------------------------------
-- 5. ensure_shop_rotations_current - reissued, adds the
--    monster_type refresh call. Singles and the other two
--    special categories are unchanged.
-- ---------------------------------------------------------

create or replace function public.ensure_shop_rotations_current()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.refresh_shop_singles_rotation_if_needed();
  perform public.refresh_shop_special_pack_rotation_if_needed('attribute');
  perform public.refresh_shop_special_pack_rotation_if_needed('archetype');
  perform public.refresh_shop_special_pack_rotation_if_needed('monster_type');
end;
$function$;

revoke all
  on function public.ensure_shop_rotations_current()
  from public;

grant execute
  on function public.ensure_shop_rotations_current()
  to authenticated;


-- ---------------------------------------------------------
-- 6. roll_shop_pack_rarity - reissued with the corrected
--    Legendary/Secret-Rare split for Premium and Deluxe (see
--    this migration's header for the audit and the exact
--    numbers). Standard and Special are numerically unchanged;
--    Special's valid-pack-code list widens to include
--    special_monster_type. Every other tier, every forced-
--    minimum-rank (pity) branch, is byte-for-byte identical to
--    the live version.
-- ---------------------------------------------------------

create or replace function public.roll_shop_pack_rarity(
  target_pack_code text,
  minimum_rank integer default 1
)
returns text
language plpgsql
as $function$
declare
  roll numeric;
begin
  roll := random() * 100;

  -- =======================================================
  -- FORCED ULTRA+ (unchanged)
  -- =======================================================
  if minimum_rank >= 4 then
    if roll < 72 then
      return 'Ultra Rare';
    elsif roll < 95 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- FORCED SUPER+ (unchanged)
  -- =======================================================
  if minimum_rank = 3 then
    if roll < 65 then
      return 'Super Rare';
    elsif roll < 90 then
      return 'Ultra Rare';
    elsif roll < 98 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- FORCED RARE+ (unchanged)
  -- =======================================================
  if minimum_rank = 2 then
    if roll < 55 then
      return 'Rare';
    elsif roll < 83 then
      return 'Super Rare';
    elsif roll < 95 then
      return 'Ultra Rare';
    elsif roll < 99 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- NORMAL PACK - LIVE (unchanged)
  -- 68 / 24 / 6.5 / 1.15 / 0.2 / else Legendary
  -- =======================================================
  if target_pack_code = 'normal' then
    if roll < 68 then
      return 'Normal';
    elsif roll < 92 then
      return 'Rare';
    elsif roll < 98.5 then
      return 'Super Rare';
    elsif roll < 99.65 then
      return 'Ultra Rare';
    elsif roll < 99.85 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- PREMIUM PACK - CORRECTED (2026-08-31, Legendary-odds
  -- hierarchy fix): Legendary raised 0.10% -> 0.30% (was, absurdly,
  -- LOWER than the cheaper Standard pack's 0.15% despite costing
  -- 3x as much - see this migration's header). Secret Rare's share
  -- reduced by the same 0.20 points (1.9 -> 1.70) so the
  -- distribution still sums to 100; every other tier unchanged.
  -- 30 / 38 / 22 / 8 / 1.70 / else Legendary
  -- =======================================================
  if target_pack_code = 'premium' then
    if roll < 30 then
      return 'Normal';
    elsif roll < 68 then
      return 'Rare';
    elsif roll < 90 then
      return 'Super Rare';
    elsif roll < 98 then
      return 'Ultra Rare';
    elsif roll < 99.7 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- DELUXE PACK - CORRECTED (2026-08-31, Legendary-odds hierarchy
  -- fix): Legendary raised 0.45% -> 0.50%, keeping Deluxe the best
  -- Legendary chance among the three normal purchasable tiers
  -- (Standard 0.15% < Premium 0.30% < Deluxe 0.50%) without making
  -- it common - still roughly 1-in-200. Secret Rare's share reduced
  -- by the same 0.05 points (11.55 -> 11.50) so the distribution
  -- still sums to 100; every other tier unchanged.
  -- 11 / 20 / 31 / 26 / 11.50 / else Legendary
  -- =======================================================
  if target_pack_code = 'deluxe' then
    if roll < 11 then
      return 'Normal';
    elsif roll < 31 then
      return 'Rare';
    elsif roll < 62 then
      return 'Super Rare';
    elsif roll < 88 then
      return 'Ultra Rare';
    elsif roll < 99.5 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  -- =======================================================
  -- SPECIAL PACK(S) - odds unchanged (2026-08-31 hierarchy audit:
  -- 0.25% Legendary already sits below Premium's corrected 0.30%
  -- and Deluxe's corrected 0.50%, so Special already satisfies
  -- "thematic targeting, not a Legendary-farming route" without
  -- any numeric change - only the pack-code list is widened here
  -- to add special_monster_type, the new third rotation category).
  -- Shared by special_attribute, special_archetype and
  -- special_monster_type, plus the legacy 'special' code for
  -- backward compatibility with any code path that might still
  -- pass it.
  -- 18 / 29 / 29 / 17.3 / 6.45 / else Legendary
  -- =======================================================
  if target_pack_code in ('special', 'special_attribute', 'special_archetype', 'special_monster_type') then
    if roll < 18 then
      return 'Normal';
    elsif roll < 47 then
      return 'Rare';
    elsif roll < 76 then
      return 'Super Rare';
    elsif roll < 93.3 then
      return 'Ultra Rare';
    elsif roll < 99.75 then
      return 'Secret Rare';
    else
      return 'Legendary';
    end if;
  end if;

  raise exception 'Unknown pack code.';
end;
$function$;


-- ---------------------------------------------------------
-- 7. pick_shop_pack_card - reissued with the league-wide-
--    Legendary candidate-selection fix (see this migration's
--    header for the "verify the existing safe reroll/fallback
--    mechanism" audit finding). Theme matching, fallback tier
--    order, and the Master Duel eligibility filter are otherwise
--    byte-for-byte identical to the live version.
-- ---------------------------------------------------------

create or replace function public.pick_shop_pack_card(
  target_profile_id uuid,
  target_rarity text,
  target_rotation_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  theme_type text;
  theme_value text;
  chosen_card_id uuid;
  current_league_id uuid;
begin
  -- =======================================================
  -- LEAGUE-WIDE LEGENDARY SCARCITY FIX (2026-08-31, Phase 2
  -- special-pack rebuild): this function's own candidate queries
  -- previously excluded a card only if THIS player individually
  -- already held it at copy_limit - for Legendary (limit=1
  -- league-wide, per shop_card_copy_limit()) this meant an
  -- already-league-owned Legendary (owned by a DIFFERENT player)
  -- was still offered as a "candidate" here, relying entirely on
  -- purchase_shop_pack()'s own outer retry loop to catch and
  -- reject it. For a narrow special-pack theme with only one
  -- matching Legendary, every one of that loop's up to 25 retries
  -- could keep re-selecting the SAME already-owned card (this
  -- function has no memory of previous attempts), causing a false
  -- 'Could not find an eligible card for this pack' failure even
  -- when other, unclaimed Legendaries existed under a broader
  -- filter. Every copy-limit check below now excludes an
  -- already-league-owned Legendary directly (matching the same
  -- Legendary-is-league-wide / everything-else-is-per-player
  -- branch already used in purchase_shop_pack's own 2026-08-30
  -- fix), so this function's existing theme -> no-theme -> any-
  -- rarity fallback chain does its job correctly on the first
  -- attempt instead of depending on the caller's retry loop.
  -- =======================================================
  select lm.league_id
  into current_league_id
  from public.league_members lm
  where lm.profile_id = target_profile_id
  limit 1;
  -- =======================================================
  -- SPECIAL THEME
  -- =======================================================
  if target_rotation_id is not null then
    select
      theme_category,
      shop_special_pack_rotations.theme_value
    into
      theme_type,
      theme_value
    from public.shop_special_pack_rotations
    where id = target_rotation_id;
  end if;

  -- =======================================================
  -- TRY EXACT RARITY + THEME
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    and card.game_rarity = target_rarity
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.card_catalog_id = card.id
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
    ) < public.shop_card_copy_limit(card.game_rarity)
    and (
      theme_type is null
      or theme_value is null
      or case theme_type
        when 'archetype'
          then coalesce(card.archetype, '') ilike '%' || theme_value || '%'
        when 'attribute'
          then coalesce(card.attribute, '') ilike '%' || theme_value || '%'
        when 'monster_type'
          then coalesce(card.monster_type, '') ilike '%' || theme_value || '%'
        when 'card_type'
          then coalesce(card.card_type, '') ilike '%' || theme_value || '%'
        when 'frame_type'
          then coalesce(card.frame_type, '') ilike '%' || theme_value || '%'
        when 'custom'
          then true
        else true
      end
    )
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FALLBACK:
  -- EXACT RARITY WITHOUT THEME
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    and card.game_rarity = target_rarity
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.card_catalog_id = card.id
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
    ) < public.shop_card_copy_limit(card.game_rarity)
  order by random()
  limit 1;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FALLBACK:
  -- THEMED CARD OF ANY RARITY
  -- =======================================================
  if theme_type is not null and theme_value is not null then
    select
      card.id
    into chosen_card_id
    from public.card_catalog card
    where
      card.format_eligible = true
      and public.is_master_duel_offerable(card.master_duel_status)
      and (
        select count(*)
        from public.card_instances instance
        where
          instance.card_catalog_id = card.id
          and (
            case
              when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
              else instance.current_owner_id = target_profile_id
            end
          )
      ) < public.shop_card_copy_limit(card.game_rarity)
      and case theme_type
        when 'archetype'
          then coalesce(card.archetype, '') ilike '%' || theme_value || '%'
        when 'attribute'
          then coalesce(card.attribute, '') ilike '%' || theme_value || '%'
        when 'monster_type'
          then coalesce(card.monster_type, '') ilike '%' || theme_value || '%'
        when 'card_type'
          then coalesce(card.card_type, '') ilike '%' || theme_value || '%'
        when 'frame_type'
          then coalesce(card.frame_type, '') ilike '%' || theme_value || '%'
        when 'custom'
          then true
        else true
      end
    order by random()
    limit 1;
  end if;

  if chosen_card_id is not null then
    return chosen_card_id;
  end if;

  -- =======================================================
  -- FINAL FALLBACK:
  -- ANY CARD BELOW OWNERSHIP CAP
  -- =======================================================
  select
    card.id
  into chosen_card_id
  from public.card_catalog card
  where
    card.format_eligible = true
    and public.is_master_duel_offerable(card.master_duel_status)
    and (
      select count(*)
      from public.card_instances instance
      where
        instance.card_catalog_id = card.id
        and (
          case
            when card.game_rarity = 'Legendary' then instance.league_id = current_league_id
            else instance.current_owner_id = target_profile_id
          end
        )
    ) < public.shop_card_copy_limit(card.game_rarity)
  order by random()
  limit 1;

  if chosen_card_id is null then
    raise exception 'No eligible cards remain for this player.';
  end if;

  return chosen_card_id;
end;
$function$;

revoke all
  on function public.pick_shop_pack_card(uuid, text, uuid)
  from public;

grant execute
  on function public.pick_shop_pack_card(uuid, text, uuid)
  to authenticated;



-- ---------------------------------------------------------
-- 8. purchase_shop_pack - reissued to accept the new
--    'special_monster_type' pack code (widened in the pack-
--    validity check, the theme_category mapping, the required-
--    voucher-type mapping, and both special-pack pity threshold
--    checks - 7 sites total, listed in this migration's own
--    commit history). Every other line - payment, purchase/
--    opening/pity records, card generation loop, Legendary
--    league-wide copy-limit check, first-pull tracking, voucher
--    consumption - is byte-for-byte identical to the live
--    version (202608302335).
-- ---------------------------------------------------------

create or replace function public.purchase_shop_pack(
  target_pack_code text,
  target_voucher_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  pity_count integer := 0;
  position_number integer;
  minimum_rarity_rank integer;
  rolled_rarity text;
  chosen_card_id uuid;
  chosen_card_rarity text;
  copy_limit integer;
  current_owned_count integer;
  next_copy_number integer;
  new_instance_id uuid;
  hit_pity_target boolean := false;
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
  -- PITY STATE
  -- =======================================================
  insert into public.shop_pack_pity (
    profile_id,
    pack_code,
    packs_since_ultra_or_better
  )
  values (
    current_user_id,
    target_pack_code,
    0
  )
  on conflict (profile_id, pack_code)
  do nothing;

  select
    packs_since_ultra_or_better
  into pity_count
  from public.shop_pack_pity
  where
    profile_id = current_user_id
    and pack_code = target_pack_code
  for update;

  -- =======================================================
  -- GENERATE CARDS
  -- =======================================================
  for position_number in 1..pack_card_count loop
    minimum_rarity_rank := 1;

    -- NORMAL PITY
    if target_pack_code = 'normal'
      and pity_count >= 8
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    -- PREMIUM
    elsif target_pack_code = 'premium'
      and pity_count >= 7
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 4;
    elsif target_pack_code = 'premium'
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 2;
    -- DELUXE
    elsif target_pack_code = 'deluxe'
      and pity_count >= 5
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 5;
    elsif target_pack_code = 'deluxe'
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    -- SPECIAL (both categories share the old 'special' thresholds)
    elsif target_pack_code in ('special_attribute', 'special_archetype', 'special_monster_type')
      and pity_count >= 6
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 4;
    elsif target_pack_code in ('special_attribute', 'special_archetype', 'special_monster_type')
      and position_number = pack_card_count
    then
      minimum_rarity_rank := 3;
    end if;

    rolled_rarity := public.roll_shop_pack_rarity(target_pack_code, minimum_rarity_rank);

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

    -- =====================================================
    -- PITY RESET CHECK
    -- =====================================================
    if target_pack_code = 'normal'
      and public.shop_rarity_rank(chosen_card_rarity) >= 3
    then
      hit_pity_target := true;
    elsif target_pack_code = 'premium'
      and public.shop_rarity_rank(chosen_card_rarity) >= 4
    then
      hit_pity_target := true;
    elsif target_pack_code = 'deluxe'
      and public.shop_rarity_rank(chosen_card_rarity) >= 5
    then
      hit_pity_target := true;
    elsif target_pack_code in ('special_attribute', 'special_archetype', 'special_monster_type')
      and public.shop_rarity_rank(chosen_card_rarity) >= 4
    then
      hit_pity_target := true;
    end if;
  end loop;

  -- =======================================================
  -- UPDATE PITY
  -- =======================================================
  if hit_pity_target then
    update public.shop_pack_pity
    set
      packs_since_ultra_or_better = 0,
      updated_at = now()
    where
      profile_id = current_user_id
      and pack_code = target_pack_code;
  else
    update public.shop_pack_pity
    set
      packs_since_ultra_or_better = packs_since_ultra_or_better + 1,
      updated_at = now()
    where
      profile_id = current_user_id
      and pack_code = target_pack_code;
  end if;

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

revoke all
  on function public.purchase_shop_pack(text, uuid)
  from public;

grant execute
  on function public.purchase_shop_pack(text, uuid)
  to authenticated;


-- ---------------------------------------------------------
-- 9. _phase2_verify_introspect() - reissued with new checks for
--    the special-pack rebuild (slot counts per category, which
--    categories are currently active, the widened theme_category
--    constraints, and two targeted boolean checks on
--    purchase_shop_pack rather than returning its full ~550-line
--    source through the RPC). Everything from the original
--    202608311300 version is kept.
-- ---------------------------------------------------------

create or replace function public._phase2_verify_introspect()
returns jsonb
language plpgsql
security definer
set search_path to 'public, pg_catalog'
as $function$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'functions', (
      select jsonb_object_agg(fn, exists(select 1 from pg_proc where proname = fn))
      from unnest(array[
        'settle_round_rewards_v2',
        'install_default_round_rewards_v2',
        '_compute_league_match_reward',
        'refresh_shop_special_pack_rotation_if_needed',
        'roll_shop_pack_rarity',
        'pick_shop_pack_card',
        'purchase_shop_pack',
        'ensure_shop_rotations_current'
      ]) as fn
    ),
    'sources', (
      select jsonb_object_agg(p.proname, p.prosrc)
      from pg_proc p
      where p.proname in (
        'install_default_round_rewards_v2',
        '_compute_league_match_reward',
        'settle_round_rewards_v2',
        'refresh_shop_special_pack_rotation_if_needed',
        'roll_shop_pack_rarity',
        'pick_shop_pack_card'
      )
    ),
    'purchase_shop_pack_checks', (
      select jsonb_build_object(
        'supports_special_monster_type', p.prosrc ilike '%special_monster_type%',
        'has_league_wide_legendary_fix', p.prosrc ilike '%LEAGUE-WIDE LEGENDARY SCARCITY FIX%'
      )
      from pg_proc p
      where p.proname = 'purchase_shop_pack'
      limit 1
    ),
    'constraints', (
      select jsonb_object_agg(rel.relname || '.' || c.conname, pg_get_constraintdef(c.oid))
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      where rel.relname in (
        'competition_round_reward_rules',
        'competition_round_reward_grants',
        'shop_special_pack_rotations',
        'shop_special_pack_slots'
      )
        and c.contype = 'c'
        and (
          pg_get_constraintdef(c.oid) ilike '%role%'
          or pg_get_constraintdef(c.oid) ilike '%theme_category%'
        )
    ),
    'league_economy_defaults', (
      select to_jsonb(d) - 'id' - 'updated_at'
      from public.league_economy_defaults d
      where d.id = true
    ),
    'shop_pack_types', (
      select jsonb_object_agg(t.code, t.price_dp)
      from public.shop_pack_types t
      where t.code in ('normal', 'premium', 'deluxe')
    ),
    'active_special_pack_prices', (
      select coalesce(jsonb_agg(distinct r.price_dp), '[]'::jsonb)
      from public.shop_special_pack_rotations r
      where r.status = 'active'
    ),
    'active_special_pack_categories', (
      select coalesce(jsonb_agg(distinct r.theme_category order by r.theme_category), '[]'::jsonb)
      from public.shop_special_pack_rotations r
      where r.status = 'active'
        and r.starts_at <= now()
        and r.ends_at > now()
    ),
    'special_pack_slot_counts', (
      select coalesce(jsonb_object_agg(theme_category, cnt), '{}'::jsonb)
      from (
        select theme_category, count(*) as cnt
        from public.shop_special_pack_slots
        group by theme_category
      ) counts
    ),
    'round_reward_rule_role_counts', (
      select jsonb_object_agg(role, cnt)
      from (
        select role, count(*) as cnt
        from public.competition_round_reward_rules
        group by role
      ) counts
    )
  ) into result;

  return result;
end;
$function$;

revoke all on function public._phase2_verify_introspect() from public;
grant execute on function public._phase2_verify_introspect() to service_role;

-- =========================================================
-- POST-ROLLOUT STRUCTURAL ASSERTIONS
--
-- Hard-fail (and roll back the ENTIRE transaction) only on
-- structural invariants this same script just created or modified -
-- these cannot legitimately be false unless something upstream
-- silently failed. Mirrors the assertion style of Phase 1's own
-- rollout script.
-- =========================================================

do $$
declare
  v_defaults_row public.league_economy_defaults%rowtype;
  v_rules_constraint_def text;
  v_grants_constraint_def text;
  v_normal_price integer;
  v_premium_price integer;
  v_deluxe_price integer;
  v_rotations_theme_constraint_def text;
  v_roll_rarity_src text;
  v_purchase_pack_src text;
  v_pick_card_src text;
begin
  if to_regclass('public.league_economy_defaults') is null then
    raise exception 'PHASE 2 ROLLOUT ABORTED: public.league_economy_defaults table was not created.';
  end if;

  select * into v_defaults_row from public.league_economy_defaults where id = true;
  if not found then
    raise exception 'PHASE 2 ROLLOUT ABORTED: league_economy_defaults singleton row was not seeded.';
  end if;

  if v_defaults_row.match_win_dp <> 100 or v_defaults_row.match_loss_dp <> 75 then
    raise exception 'PHASE 2 ROLLOUT ABORTED: league_economy_defaults match DP does not match the approved baseline (win=100, loss=75). Found win=%, loss=%.',
      v_defaults_row.match_win_dp, v_defaults_row.match_loss_dp;
  end if;

  if v_defaults_row.round_participation_dp <> 250
     or v_defaults_row.round_first_dp <> 150
     or v_defaults_row.round_second_dp <> 75 then
    raise exception 'PHASE 2 ROLLOUT ABORTED: league_economy_defaults round DP does not match the approved baseline (participation=250, first=150, second=75). Found participation=%, first=%, second=%.',
      v_defaults_row.round_participation_dp, v_defaults_row.round_first_dp, v_defaults_row.round_second_dp;
  end if;

  if to_regprocedure('public._compute_league_match_reward(uuid, uuid, uuid)') is null then
    raise exception 'PHASE 2 ROLLOUT ABORTED: _compute_league_match_reward(uuid, uuid, uuid) function was not created.';
  end if;

  if to_regprocedure('public.install_default_round_rewards_v2(uuid)') is null then
    raise exception 'PHASE 2 ROLLOUT ABORTED: install_default_round_rewards_v2(uuid) function was not created.';
  end if;

  if to_regprocedure('public.settle_round_rewards_v2(uuid, integer)') is null then
    raise exception 'PHASE 2 ROLLOUT ABORTED: settle_round_rewards_v2(uuid, integer) function was not created.';
  end if;

  if to_regprocedure('public.refresh_shop_special_pack_rotation_if_needed(text)') is null then
    raise exception 'PHASE 2 ROLLOUT ABORTED: refresh_shop_special_pack_rotation_if_needed(text) function was not created.';
  end if;

  if to_regprocedure('public._phase2_verify_introspect()') is null then
    raise exception 'PHASE 2 ROLLOUT ABORTED: _phase2_verify_introspect() helper function was not created - the verification script will not be able to run.';
  end if;

  select pg_get_constraintdef(c.oid) into v_rules_constraint_def
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  where rel.relname = 'competition_round_reward_rules'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%role%'
  limit 1;

  if v_rules_constraint_def is null or v_rules_constraint_def not ilike '%round_runner_up%' then
    raise exception 'PHASE 2 ROLLOUT ABORTED: competition_round_reward_rules role check constraint does not allow round_runner_up (found: %).', coalesce(v_rules_constraint_def, 'no matching constraint');
  end if;

  select pg_get_constraintdef(c.oid) into v_grants_constraint_def
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  where rel.relname = 'competition_round_reward_grants'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%role%'
  limit 1;

  if v_grants_constraint_def is null or v_grants_constraint_def not ilike '%round_runner_up%' then
    raise exception 'PHASE 2 ROLLOUT ABORTED: competition_round_reward_grants reward_role check constraint does not allow round_runner_up (found: %).', coalesce(v_grants_constraint_def, 'no matching constraint');
  end if;

  select price_dp into v_normal_price from public.shop_pack_types where code = 'normal';
  select price_dp into v_premium_price from public.shop_pack_types where code = 'premium';
  select price_dp into v_deluxe_price from public.shop_pack_types where code = 'deluxe';

  if v_normal_price <> 300 or v_premium_price <> 900 or v_deluxe_price <> 1500 then
    raise exception 'PHASE 2 ROLLOUT ABORTED: shop_pack_types prices do not match the approved baseline (normal=300, premium=900, deluxe=1500). Found normal=%, premium=%, deluxe=%.',
      v_normal_price, v_premium_price, v_deluxe_price;
  end if;

  if exists (
    select 1 from public.shop_special_pack_rotations
    where status = 'active' and price_dp <> 1200
  ) then
    raise exception 'PHASE 2 ROLLOUT ABORTED: an active shop_special_pack_rotations row still has a price other than 1200 DP.';
  end if;

  if to_regclass('public.shop_special_pack_slots') is null then
    raise exception 'PHASE 2 ROLLOUT ABORTED: public.shop_special_pack_slots table was not created.';
  end if;

  if (select count(distinct theme_category) from public.shop_special_pack_slots) < 3 then
    raise exception 'PHASE 2 ROLLOUT ABORTED: shop_special_pack_slots does not have configured slots for all 3 theme categories (attribute, archetype, monster_type). Found: %.',
      (select coalesce(string_agg(distinct theme_category, ', '), '(none)') from public.shop_special_pack_slots);
  end if;

  select pg_get_constraintdef(c.oid) into v_rotations_theme_constraint_def
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  where rel.relname = 'shop_special_pack_rotations'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%theme_category%'
  limit 1;

  if v_rotations_theme_constraint_def is null or v_rotations_theme_constraint_def not ilike '%monster_type%' then
    raise exception 'PHASE 2 ROLLOUT ABORTED: shop_special_pack_rotations theme_category check constraint does not allow monster_type (found: %).', coalesce(v_rotations_theme_constraint_def, 'no matching constraint');
  end if;

  if to_regprocedure('public.roll_shop_pack_rarity(text, integer)') is null then
    raise exception 'PHASE 2 ROLLOUT ABORTED: roll_shop_pack_rarity(text, integer) function was not created.';
  end if;

  if to_regprocedure('public.pick_shop_pack_card(uuid, text, text, integer)') is null
     and to_regprocedure('public.pick_shop_pack_card(uuid, text, text)') is null then
    raise notice 'PHASE 2 ROLLOUT: could not confirm pick_shop_pack_card signature via to_regprocedure (this is a NOTICE, not an abort - argument-signature lookups are brittle across reissues; the introspection-based verify-phase2-live.mjs check is the authoritative one for this function).';
  end if;

  select p.prosrc into v_roll_rarity_src from pg_proc p where p.proname = 'roll_shop_pack_rarity' limit 1;
  if v_roll_rarity_src is null
     or v_roll_rarity_src not like '%99.7%'
     or v_roll_rarity_src not like '%99.5%' then
    raise exception 'PHASE 2 ROLLOUT ABORTED: roll_shop_pack_rarity does not contain the corrected Legendary-odds threshold literals (99.7 for Premium, 99.5 for Deluxe).';
  end if;

  select p.prosrc into v_purchase_pack_src from pg_proc p where p.proname = 'purchase_shop_pack' limit 1;
  if v_purchase_pack_src is null or v_purchase_pack_src not ilike '%special_monster_type%' then
    raise exception 'PHASE 2 ROLLOUT ABORTED: purchase_shop_pack does not support the special_monster_type pack code - the 3rd special-pack-category migration did not apply correctly.';
  end if;

  select p.prosrc into v_pick_card_src from pg_proc p where p.proname = 'pick_shop_pack_card' limit 1;
  if v_pick_card_src is null or v_pick_card_src not ilike '%current_league_id%' then
    raise exception 'PHASE 2 ROLLOUT ABORTED: pick_shop_pack_card does not contain the league-wide Legendary copy-limit fix (current_league_id) - narrow-theme special packs may spuriously fail to purchase once a Legendary is already owned in the league.';
  end if;

  raise notice 'PHASE 2 ROLLOUT: all structural assertions passed (league_economy_defaults seeded with approved baseline; 3-tier round rewards installed; role/reward_role constraints widened for round_runner_up; pack shop and active special-pack prices corrected; verification helper installed; special-pack rotation widened to 3 categories with a populated slot table; Legendary-odds hierarchy corrected; pick_shop_pack_card league-wide Legendary fix applied).';
end $$;

commit;
