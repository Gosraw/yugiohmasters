-- =========================================================
-- COMPETITION V2 REWARD CORRECTION - HARDENING
--
-- Fixes two real financial-integrity bugs in
-- correct_competition_match_result_v2() (202608231100), found
-- before this ever ran against production:
--
-- BUG 1 - DP reversal / ledger mismatch. The old code capped the
-- actual balance debit with `greatest(0, duel_points - granted)`
-- but then ALWAYS logged `amount = -granted` in
-- duel_point_transactions, regardless of what was actually taken
-- back. Example: a 1000 DP reward was granted, the player now has
-- only 100 DP left (spent in the shop since) - the old code would
-- zero the balance (100 -> 0) but log a -1000 transaction, so
-- balance_after would even be wrong relative to amount. Ledger and
-- real balance would silently diverge.
--
-- BUG 2 - voucher rewards were never reversed at all. The old
-- competition_reward_grants row was marked 'reversed', but the
-- reward_vouchers row it produced was left completely untouched -
-- a corrected-away placement kept its voucher forever, and the
-- newly-correct placement could go on to be granted a fresh one.
--
-- FIX SUMMARY
-- - DP reversal now caps the actual debit at the player's CURRENT
--   balance (duel_points can never go negative -
--   profiles_duel_points_check already enforces this), and the
--   logged transaction amount always matches the actual debit
--   exactly. Anything that could not be recovered (already spent)
--   is recorded explicitly on the reversed grant row - never
--   silently dropped, never faked as fully reversed.
-- - reward_vouchers gains a `competition_reward_grant_id` back-
--   reference (set at grant time) so a correction can find and
--   reclaim EXACTLY the voucher(s) one specific grant produced,
--   not just "some voucher of this type" (which could belong to a
--   different competition or a manual grant). Only the remaining,
--   still-unspent quantity is reclaimed; an already-fully-spent
--   voucher (row deleted by purchase_shop_pack once its quantity
--   hits 0) is never resurrected - it is recorded as an explicit,
--   auditable unrecovered amount instead.
-- - competition_reward_grants gains 4 additive audit columns
--   (duel_points_recovered/unrecovered,
--   voucher_quantity_recovered/unrecovered) so every reversal's
--   actual outcome is queryable after the fact, not just implied
--   by the transaction log.
-- - finalize_competition_v2, distribute_competition_rewards_v2 and
--   correct_competition_match_result_v2 now all take the SAME
--   single advisory lock key
--   (competition_reward_lifecycle_<competition_id>) instead of two
--   different keys (competition_finalize_ vs competition_rewards_).
--   Previously distribute_competition_rewards_v2 and
--   correct_competition_match_result_v2 could in principle run
--   concurrently against the same competition under two unrelated
--   lock names; a single shared key removes that gap entirely and,
--   since only one advisory lock is ever taken per call, there is
--   no lock-ordering/deadlock risk to manage.
--
-- SAFETY: purely additive. No table is dropped, no row is deleted
-- by this migration, no existing column changes type or
-- nullability. All three functions below are the SAME functions as
-- 202608231100 (same name, same signature, same argument order) -
-- this is a CREATE OR REPLACE, not a new object. Scheduling,
-- standings, tiebreakers, BO3, round generation, the competition
-- UI, Shop, Trading, Master Duel eligibility and the Legendary
-- uniqueness rule are all untouched.
-- =========================================================


-- ---------------------------------------------------------
-- 1. AUDIT COLUMNS ON competition_reward_grants
-- ---------------------------------------------------------

alter table public.competition_reward_grants
  add column if not exists duel_points_recovered integer not null default 0,
  add column if not exists duel_points_unrecovered integer not null default 0,
  add column if not exists voucher_quantity_recovered integer not null default 0,
  add column if not exists voucher_quantity_unrecovered integer not null default 0;

comment on column public.competition_reward_grants.duel_points_recovered is
  'Set only when this grant was reversed. How much DP was actually debited back from the player''s CURRENT balance - may be less than duel_points_granted if some/all of it had already been spent.';

comment on column public.competition_reward_grants.duel_points_unrecovered is
  'Set only when this grant was reversed. duel_points_granted minus duel_points_recovered - DP that could not be clawed back because the balance no longer had it. Always 0 when the full amount was recovered.';

comment on column public.competition_reward_grants.voucher_quantity_recovered is
  'Set only when this grant was reversed. How much of the originally-granted voucher quantity was still present (via reward_vouchers.competition_reward_grant_id) and could be reclaimed.';

comment on column public.competition_reward_grants.voucher_quantity_unrecovered is
  'Set only when this grant was reversed. voucher_quantity minus voucher_quantity_recovered - voucher quantity that had already been spent (its reward_vouchers row was decremented/deleted) and could not be clawed back.';


-- ---------------------------------------------------------
-- 2. VOUCHER PROVENANCE
--
-- Without this, a reversal can only search reward_vouchers by
-- voucher_type + source_id, which is ambiguous the moment a player
-- has more than one voucher of the same type from the same
-- competition (e.g. after a second correction) or generally isn't
-- precise about WHICH grant a given voucher row came from. This
-- column is nullable and only ever set going forward from this
-- migration - existing (pre-migration) voucher rows have no way to
-- be retroactively linked and are a known, documented limitation
-- (see the report).
-- ---------------------------------------------------------

alter table public.reward_vouchers
  add column if not exists competition_reward_grant_id uuid
    references public.competition_reward_grants(id)
    on delete set null;

create index if not exists reward_vouchers_grant_idx
  on public.reward_vouchers(competition_reward_grant_id)
  where competition_reward_grant_id is not null;


-- ---------------------------------------------------------
-- 3. FINALIZE - unchanged except the shared lock key.
-- ---------------------------------------------------------

create or replace function public.finalize_competition_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  incomplete_count integer;
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

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can finalize a competition.';
  end if;

  -- Idempotent: finalizing an already-completed competition is a no-op,
  -- not an error - safe for a retried admin click or a double network
  -- request.
  if competition_row.status = 'completed' then
    return;
  end if;

  if competition_row.status <> 'active' then
    raise exception 'Only an active competition can be finalized.';
  end if;

  select count(*)
  into incomplete_count
  from public.matches
  where competition_id = target_competition_id
    and status <> 'completed';

  if incomplete_count > 0 then
    raise exception 'Cannot finalize: % match(es) are not completed yet.', incomplete_count;
  end if;

  delete from public.competition_results where competition_id = target_competition_id;

  insert into public.competition_results (
    competition_id, profile_id, placement, wins, losses, draws, points
  )
  select
    target_competition_id, s.profile_id, s.placement, s.wins, s.losses, s.draws, s.points
  from public.get_competition_standings_v2(target_competition_id) s;

  update public.competitions
  set status = 'completed', completed_at = now(), current_round = null, updated_at = now()
  where id = target_competition_id;
end;
$function$;

revoke all on function public.finalize_competition_v2(uuid) from public;
grant execute on function public.finalize_competition_v2(uuid) to authenticated;


-- ---------------------------------------------------------
-- 4. REWARD DISTRIBUTION - shared lock key, and the grant row is
--    now inserted FIRST (before the DP transaction / voucher) so
--    both can carry a precise `competition_reward_grant_id` /
--    `grant_id` back-reference. Same idempotency guarantee as
--    before (skip if an active grant already exists for this
--    player), same payout amounts, same rule lookup.
-- ---------------------------------------------------------

create or replace function public.distribute_competition_rewards_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  result_row record;
  rule_row public.competition_reward_rules%rowtype;
  new_balance integer;
  new_tx_id uuid;
  new_grant_id uuid;
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
end;
$function$;

revoke all on function public.distribute_competition_rewards_v2(uuid) from public;
grant execute on function public.distribute_competition_rewards_v2(uuid) to authenticated;


-- ---------------------------------------------------------
-- 5. RESULT CORRECTION - hardened reversal. Everything through
--    match validation/update and the standings recompute loop is
--    UNCHANGED from 202608231100; only the reversal block (DP +
--    voucher) and the shared lock key are different.
-- ---------------------------------------------------------

create or replace function public.correct_competition_match_result_v2(
  target_match_id uuid,
  target_player_one_duel_wins integer,
  target_player_two_duel_wins integer,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Same key finalize_competition_v2 and distribute_competition_rewards_v2
  -- now also use - a correction can never run concurrently with either
  -- of those against the same competition, and vice versa. Only one
  -- advisory lock is ever taken here, so there is no ordering/deadlock
  -- concern to manage.
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

  if competition_row.status <> 'completed' then
    -- Not finalized yet - live standings will simply reflect the
    -- corrected match on next read. Nothing to reconcile.
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

revoke all on function public.correct_competition_match_result_v2(uuid, integer, integer, text) from public;
grant execute on function public.correct_competition_match_result_v2(uuid, integer, integer, text) to authenticated;
