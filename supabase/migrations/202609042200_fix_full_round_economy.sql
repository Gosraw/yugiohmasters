begin;

-- =========================================================
-- DUELIST CIRCLE — FULL ROUND ECONOMY FIX (2026-09-04)
--
-- Approved economy:
--   Match win  = 100 DP
--   Match draw =  75 DP
--   Match loss =  75 DP
--
--   Per FULL round-robin cycle (everyone has faced everyone once):
--     everyone: +300 DP + 1 Premium Pack
--     #1:       +400 DP + 1 Standard/Normal Pack
--     #2:       +300 DP
--     #3:       +200 DP
--
-- IMPORTANT: matches.round_number is the schedule round emitted by
-- the round-robin scheduler. With 3 players there is one real match
-- per schedule round because one player has a bye, so 3 schedule
-- rounds together are ONE full competition round. The old settlement
-- paid after every schedule round and therefore overpaid by ~3x.
--
-- This migration makes settlement operate on a full round-robin
-- cycle and disables the separate end-of-competition placement
-- payout layer, so rewards are not stacked twice.
-- =========================================================


-- ---------------------------------------------------------
-- 1. CENTRAL ECONOMY CONFIG
-- ---------------------------------------------------------

alter table public.league_economy_defaults
  add column if not exists round_third_dp integer not null default 200
    check (round_third_dp >= 0);

update public.league_economy_defaults
set
  match_win_dp = 100,
  match_draw_dp = 75,
  match_loss_dp = 75,
  round_participation_dp = 300,
  round_participation_voucher_type = 'premium_pack',
  round_participation_voucher_quantity = 1,
  round_first_dp = 400,
  round_first_voucher_type = 'normal_pack',
  round_first_voucher_quantity = 1,
  round_second_dp = 300,
  round_third_dp = 200,
  updated_at = now()
where id = true;


-- ---------------------------------------------------------
-- 2. ROUND ROLE CONSTRAINTS — add explicit third place
-- ---------------------------------------------------------

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'competition_round_reward_rules'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format(
      'alter table public.competition_round_reward_rules drop constraint %I',
      con.conname
    );
  end loop;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'competition_round_reward_rules'
      and c.conname = 'competition_round_reward_rules_role_check'
  ) then
    alter table public.competition_round_reward_rules
      add constraint competition_round_reward_rules_role_check
      check (role in ('participation', 'round_winner', 'round_runner_up', 'round_third'));
  end if;
end;
$$;

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'competition_round_reward_grants'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%reward_role%'
  loop
    execute format(
      'alter table public.competition_round_reward_grants drop constraint %I',
      con.conname
    );
  end loop;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'competition_round_reward_grants'
      and c.conname = 'competition_round_reward_grants_reward_role_check'
  ) then
    alter table public.competition_round_reward_grants
      add constraint competition_round_reward_grants_reward_role_check
      check (reward_role in ('participation', 'round_winner', 'round_runner_up', 'round_third'));
  end if;
end;
$$;


-- ---------------------------------------------------------
-- 3. DEFAULT ROUND RULES — authoritative values
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

revoke all on function public.install_default_round_rewards_v2(uuid) from public;
grant execute on function public.install_default_round_rewards_v2(uuid) to authenticated;

-- Push the approved values to every existing competition's rule copy.
insert into public.competition_round_reward_rules (
  competition_id, role, duel_points, voucher_type, voucher_quantity
)
select
  c.id,
  r.role,
  r.duel_points,
  r.voucher_type,
  r.voucher_quantity
from public.competitions c
cross join lateral (
  select
    'participation'::text as role,
    d.round_participation_dp as duel_points,
    d.round_participation_voucher_type as voucher_type,
    d.round_participation_voucher_quantity as voucher_quantity
  from public.league_economy_defaults d where d.id = true

  union all

  select
    'round_winner',
    d.round_first_dp,
    d.round_first_voucher_type,
    d.round_first_voucher_quantity
  from public.league_economy_defaults d where d.id = true

  union all

  select
    'round_runner_up',
    d.round_second_dp,
    null::text,
    0
  from public.league_economy_defaults d where d.id = true

  union all

  select
    'round_third',
    d.round_third_dp,
    null::text,
    0
  from public.league_economy_defaults d where d.id = true
) r
on conflict (competition_id, role)
do update set
  duel_points = excluded.duel_points,
  voucher_type = excluded.voucher_type,
  voucher_quantity = excluded.voucher_quantity,
  updated_at = now();


-- ---------------------------------------------------------
-- 4. FULL-CYCLE ROUND SETTLEMENT
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
  reward_role text;
  reward_reason text;
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
    reward_role := case placement_row.placement
      when 1 then 'round_winner'
      when 2 then 'round_runner_up'
      when 3 then 'round_third'
      else null
    end;

    reward_reason := case placement_row.placement
      when 1 then 'round_winner_bonus'
      when 2 then 'round_runner_up_bonus'
      when 3 then 'round_third_bonus'
      else null
    end;

    if reward_role is null then
      continue;
    end if;

    if exists (
      select 1
      from public.competition_round_reward_grants
      where competition_id = target_competition_id
        and round_number = logical_round_number
        and profile_id = placement_row.profile_id
        and reward_role = reward_role
        and status = 'granted'
    ) then
      continue;
    end if;

    select * into rule_row
    from public.competition_round_reward_rules
    where competition_id = target_competition_id
      and role = reward_role;

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
      reward_role,
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

revoke all on function public.settle_round_rewards_v2(uuid, integer) from public;


-- ---------------------------------------------------------
-- 5. DISABLE THE SEPARATE END-OF-COMPETITION PLACEMENT PAYOUT
--
-- The approved economy already rewards placement once per FULL round.
-- The old V2 competition_reward_rules layer stacked another payout
-- at competition completion. Keep the table/function shape for
-- compatibility, but seed 0 DP / no voucher.
-- ---------------------------------------------------------

create or replace function public.install_default_competition_rewards_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
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

revoke all on function public.install_default_competition_rewards_v2(uuid) from public;
grant execute on function public.install_default_competition_rewards_v2(uuid) to authenticated;

update public.competition_reward_rules
set
  duel_points = 0,
  voucher_type = null,
  voucher_quantity = 0
where placement in (1, 2, 3);


-- ---------------------------------------------------------
-- 6. STRUCTURAL VERIFICATION
-- ---------------------------------------------------------

do $verify$
declare
  d public.league_economy_defaults%rowtype;
begin
  select * into d
  from public.league_economy_defaults
  where id = true;

  if d.match_win_dp <> 100
     or d.match_draw_dp <> 75
     or d.match_loss_dp <> 75
     or d.round_participation_dp <> 300
     or d.round_participation_voucher_type <> 'premium_pack'
     or d.round_participation_voucher_quantity <> 1
     or d.round_first_dp <> 400
     or d.round_first_voucher_type <> 'normal_pack'
     or d.round_first_voucher_quantity <> 1
     or d.round_second_dp <> 300
     or d.round_third_dp <> 200 then
    raise exception 'FULL ROUND ECONOMY FIX ABORTED: central values do not match approved economy.';
  end if;

  if to_regprocedure('public.settle_round_rewards_v2(uuid,integer)') is null then
    raise exception 'FULL ROUND ECONOMY FIX ABORTED: settle_round_rewards_v2 missing.';
  end if;

  if to_regprocedure('public.install_default_round_rewards_v2(uuid)') is null then
    raise exception 'FULL ROUND ECONOMY FIX ABORTED: install_default_round_rewards_v2 missing.';
  end if;
end;
$verify$;

commit;
