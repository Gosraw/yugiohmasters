-- =========================================================
-- 2.0 engagement, part 3: BOUNTY on #1 + CATCH-UP bonus for last
-- (docs/V2_PLAN.md "Engagement"; amounts = PROPOSAL from
-- docs/season-sim-report.md, stored in season_bonus_config).
--
-- Bounty:   beat the SOLE season leader (most competition wins
--           before this duel; no bounty while the lead is tied)
--           -> +75 DP to the winner.
-- Catch-up: when a round (full cycle) is settled, the SOLE last
--           place (fewest wins through that round) who is at least
--           3 wins behind the leader -> +50 DP.
--
-- Built as an ADD-ON, the settlement and submit functions from
-- 202610120120 / 202610120600 are not touched:
--   * AFTER UPDATE trigger on matches: a season duel becoming
--     'completed' records who the sole leader was BEFORE it
--     (season_match_bounty_checks, never rewritten) and pays the
--     bounty; an admin correction (winner changed) re-checks that
--     duel against the stored leader and re-syncs the catch-up of
--     every already-settled round from that duel's round on.
--   * AFTER INSERT trigger on competition_round_reward_grants: the
--     first 'participation' grant of a round = the round was just
--     settled -> sync that round's catch-up.
-- Grants live in season_bonus_grants. A grant that is no longer
-- deserved after a correction is reversed the same way round
-- grants are (status 'reversed' + a negative ledger row via
-- _debit_duel_points, partial - a balance never goes below 0).
-- Re-running any sync changes nothing (partial unique indexes).
--
-- Known limit (documented on purpose): correcting an EARLIER duel
-- does not re-judge bounties of later duels (who led before them
-- stays as recorded at the time).
-- Only season-style competitions count: V2 round robins
-- (meetings_per_pairing set), tiebreak duels never.
-- =========================================================

create table if not exists public.season_bonus_config (
  id boolean primary key default true check (id),
  bounty_enabled boolean not null default true,
  bounty_dp integer not null default 75 check (bounty_dp >= 0),
  catch_up_enabled boolean not null default true,
  catch_up_dp integer not null default 50 check (catch_up_dp >= 0),
  catch_up_min_win_gap integer not null default 3 check (catch_up_min_win_gap >= 1),
  updated_at timestamptz not null default now()
);

comment on table public.season_bonus_config is
  'Bounty / catch-up amounts (PROPOSAL from docs/season-sim-report.md). Change here, never in code.';

insert into public.season_bonus_config (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.season_match_bounty_checks (
  match_id uuid primary key references public.matches(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  leader_before_id uuid references public.profiles(id) on delete set null,
  leader_before_wins integer not null default 0,
  evaluated_at timestamptz not null default now()
);

create table if not exists public.season_bonus_grants (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bounty', 'catch_up')),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  round_number integer,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  duel_points_granted integer not null default 0,
  duel_point_transaction_id uuid references public.duel_point_transactions(id) on delete set null,
  status text not null default 'granted' check (status in ('granted', 'reversed')),
  granted_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_reason text,
  duel_points_recovered integer not null default 0,
  duel_points_unrecovered integer not null default 0,
  reversal_duel_point_transaction_id uuid references public.duel_point_transactions(id) on delete set null,
  constraint season_bonus_grants_target_check check (
    (kind = 'bounty' and match_id is not null)
    or (kind = 'catch_up' and round_number is not null)
  )
);

create unique index if not exists season_bonus_grants_one_bounty
  on public.season_bonus_grants (match_id)
  where kind = 'bounty' and status = 'granted';

create unique index if not exists season_bonus_grants_one_catch_up
  on public.season_bonus_grants (competition_id, round_number)
  where kind = 'catch_up' and status = 'granted';

create index if not exists season_bonus_grants_profile_idx
  on public.season_bonus_grants (profile_id, granted_at desc);

alter table public.season_bonus_config enable row level security;
alter table public.season_match_bounty_checks enable row level security;
alter table public.season_bonus_grants enable row level security;

drop policy if exists season_bonus_config_read on public.season_bonus_config;
create policy season_bonus_config_read on public.season_bonus_config
  for select to authenticated using (true);

drop policy if exists season_match_bounty_checks_read on public.season_match_bounty_checks;
create policy season_match_bounty_checks_read on public.season_match_bounty_checks
  for select to authenticated
  using (exists (
    select 1 from public.competitions c
    where c.id = competition_id and public.is_league_member(c.league_id)
  ));

drop policy if exists season_bonus_grants_read on public.season_bonus_grants;
create policy season_bonus_grants_read on public.season_bonus_grants
  for select to authenticated
  using (exists (
    select 1 from public.competitions c
    where c.id = competition_id and public.is_league_member(c.league_id)
  ));

-- ---------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------

create or replace function public._is_season_competition(target_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competitions c
    where c.id = target_competition_id
      and c.competition_type = 'round_robin'
      and c.meetings_per_pairing is not null
  );
$$;

-- Wins per roster member from completed, non-tiebreak duels,
-- optionally excluding one duel and/or limited to schedule rounds
-- <= target_max_schedule_round.
create or replace function public._season_win_table(
  target_competition_id uuid,
  target_exclude_match_id uuid default null,
  target_max_schedule_round integer default null
)
returns table (profile_id uuid, wins integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    cp.profile_id,
    count(m.id)::integer
  from public.competition_players cp
  left join public.matches m
    on m.competition_id = target_competition_id
   and m.tiebreak_id is null
   and m.status = 'completed'
   and m.winner_id = cp.profile_id
   and (target_exclude_match_id is null or m.id <> target_exclude_match_id)
   and (target_max_schedule_round is null or m.round_number <= target_max_schedule_round)
  where cp.competition_id = target_competition_id
  group by cp.profile_id;
$$;

create or replace function public._season_bonus_grant(
  target_kind text,
  target_competition_id uuid,
  target_match_id uuid,
  target_round_number integer,
  target_profile_id uuid,
  target_amount integer,
  target_description text,
  target_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_grant_id uuid;
  new_tx_id uuid;
begin
  insert into public.season_bonus_grants (
    kind,
    competition_id,
    match_id,
    round_number,
    profile_id,
    duel_points_granted
  )
  values (
    target_kind,
    target_competition_id,
    target_match_id,
    target_round_number,
    target_profile_id,
    target_amount
  )
  returning id
  into new_grant_id;

  if target_amount > 0 then
    -- match_id stays null on the ledger row on purpose: the
    -- (match_id, profile_id, reason) unique index would otherwise
    -- block a re-grant after a reversal.
    new_tx_id := public._credit_duel_points(
      target_profile_id,
      target_amount,
      case target_kind when 'bounty' then 'season_bounty' else 'season_catch_up' end,
      null,
      null,
      coalesce(target_metadata, '{}'::jsonb) || jsonb_build_object(
        'competition_id', target_competition_id,
        'match_id', target_match_id,
        'logical_round_number', target_round_number,
        'season_bonus_grant_id', new_grant_id
      ),
      target_description
    );

    update public.season_bonus_grants
    set duel_point_transaction_id = new_tx_id
    where id = new_grant_id;
  end if;

  return new_grant_id;
end;
$$;

create or replace function public._season_bonus_reverse(
  target_grant_id uuid,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_row public.season_bonus_grants%rowtype;
  debit_row record;
  recovered integer := 0;
  unrecovered integer := 0;
  reversal_tx_id uuid;
begin
  select *
  into grant_row
  from public.season_bonus_grants
  where id = target_grant_id
  for update;

  if not found or grant_row.status <> 'granted' then
    return;
  end if;

  if grant_row.duel_points_granted > 0 then
    select *
    into debit_row
    from public._debit_duel_points(
      grant_row.profile_id,
      grant_row.duel_points_granted,
      case grant_row.kind when 'bounty' then 'season_bounty_reversal' else 'season_catch_up_reversal' end,
      null,
      target_reason,
      jsonb_build_object(
        'competition_id', grant_row.competition_id,
        'match_id', grant_row.match_id,
        'logical_round_number', grant_row.round_number,
        'season_bonus_grant_id', grant_row.id
      ),
      case grant_row.kind
        when 'bounty' then 'Bounty taken back — duel result corrected'
        else 'Catch-up bonus taken back — Round ' || grant_row.round_number || ' standings corrected'
      end,
      true
    );

    recovered := debit_row.debited;
    unrecovered := debit_row.unrecovered;
    reversal_tx_id := debit_row.transaction_id;
  end if;

  update public.season_bonus_grants
  set
    status = 'reversed',
    reversed_at = now(),
    reversal_reason = target_reason,
    duel_points_recovered = recovered,
    duel_points_unrecovered = unrecovered,
    reversal_duel_point_transaction_id = reversal_tx_id
  where id = grant_row.id;
end;
$$;

-- ---------------------------------------------------------
-- Bounty
-- ---------------------------------------------------------

-- Who was the SOLE leader before this duel? Recorded once, at the
-- moment the duel is first completed (every other completed duel
-- is earlier by definition).
create or replace function public._record_match_bounty_check(target_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.matches%rowtype;
  top_wins integer;
  top_count integer;
  top_profile uuid;
begin
  select *
  into match_row
  from public.matches
  where id = target_match_id;

  if not found or match_row.competition_id is null then
    return;
  end if;

  with win_table as (
    select *
    from public._season_win_table(match_row.competition_id, target_match_id, null)
  )
  select
    max(wt.wins),
    count(*) filter (where wt.wins = (select max(wins) from win_table))
  into top_wins, top_count
  from win_table wt;

  if top_count = 1 and top_wins > 0 then
    with win_table as (
      select *
      from public._season_win_table(match_row.competition_id, target_match_id, null)
    )
    select wt.profile_id
    into top_profile
    from win_table wt
    where wt.wins = top_wins;
  end if;

  insert into public.season_match_bounty_checks (
    match_id,
    competition_id,
    leader_before_id,
    leader_before_wins
  )
  values (
    target_match_id,
    match_row.competition_id,
    top_profile,
    coalesce(top_wins, 0)
  )
  on conflict (match_id) do nothing;
end;
$$;

create or replace function public._sync_match_bounty(
  target_match_id uuid,
  target_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  config_row public.season_bonus_config%rowtype;
  match_row public.matches%rowtype;
  check_row public.season_match_bounty_checks%rowtype;
  loser_id uuid;
  expected_profile uuid := null;
  active_grant public.season_bonus_grants%rowtype;
  leader_name text;
begin
  select *
  into config_row
  from public.season_bonus_config
  where id = true;

  if not found or not config_row.bounty_enabled then
    return;
  end if;

  select *
  into match_row
  from public.matches
  where id = target_match_id;

  if not found
     or match_row.competition_id is null
     or match_row.tiebreak_id is not null
     or not public._is_season_competition(match_row.competition_id) then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('competition_reward_lifecycle_' || match_row.competition_id::text)
  );

  -- Only duels whose leader snapshot was recorded when they were
  -- first completed (older duels are never judged after the fact).
  if match_row.status = 'completed' and match_row.winner_id is not null then
    select *
    into check_row
    from public.season_match_bounty_checks
    where match_id = target_match_id;

    loser_id := case
      when match_row.winner_id = match_row.player_one_id then match_row.player_two_id
      else match_row.player_one_id
    end;

    if found and check_row.leader_before_id is not null and check_row.leader_before_id = loser_id then
      expected_profile := match_row.winner_id;
    end if;
  end if;

  select *
  into active_grant
  from public.season_bonus_grants
  where kind = 'bounty'
    and match_id = target_match_id
    and status = 'granted';

  if found and active_grant.profile_id is not distinct from expected_profile then
    return;
  end if;

  if found then
    perform public._season_bonus_reverse(
      active_grant.id,
      coalesce(target_reason, 'Duel result corrected.')
    );
  end if;

  if expected_profile is null or config_row.bounty_dp <= 0 then
    return;
  end if;

  select coalesce(p.duelist_name, p.username)
  into leader_name
  from public.profiles p
  where p.id = loser_id;

  perform public._season_bonus_grant(
    'bounty',
    match_row.competition_id,
    target_match_id,
    null,
    expected_profile,
    config_row.bounty_dp,
    'Bounty: beat season leader ' || coalesce(leader_name, 'the leader'),
    jsonb_build_object(
      'leader_id', loser_id,
      'leader_wins_before', check_row.leader_before_wins
    )
  );
end;
$$;

-- ---------------------------------------------------------
-- Catch-up
-- ---------------------------------------------------------

create or replace function public._sync_round_catch_up(
  target_competition_id uuid,
  target_logical_round integer,
  target_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  config_row public.season_bonus_config%rowtype;
  player_count integer;
  cycle_size integer;
  block_end integer;
  top_wins integer;
  bottom_wins integer;
  bottom_count integer;
  expected_profile uuid := null;
  active_grant public.season_bonus_grants%rowtype;
begin
  select *
  into config_row
  from public.season_bonus_config
  where id = true;

  if not found or not config_row.catch_up_enabled then
    return;
  end if;

  if target_logical_round is null
     or target_logical_round < 1
     or not public._is_season_competition(target_competition_id) then
    return;
  end if;

  -- Only rounds that were actually settled.
  if not exists (
    select 1
    from public.competition_round_reward_grants g
    where g.competition_id = target_competition_id
      and g.round_number = target_logical_round
      and g.reward_role = 'participation'
      and g.status = 'granted'
  ) then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('competition_reward_lifecycle_' || target_competition_id::text)
  );

  select count(*)
  into player_count
  from public.competition_players
  where competition_id = target_competition_id;

  if player_count < 2 then
    return;
  end if;

  -- Same cycle maths as _settle_round_cycle.
  cycle_size := case
    when mod(player_count, 2) = 0 then player_count - 1
    else player_count
  end;

  block_end := target_logical_round * cycle_size;

  select max(w.wins), min(w.wins)
  into top_wins, bottom_wins
  from public._season_win_table(target_competition_id, null, block_end) w;

  select count(*)
  into bottom_count
  from public._season_win_table(target_competition_id, null, block_end) w
  where w.wins = bottom_wins;

  if bottom_count = 1 and top_wins - bottom_wins >= config_row.catch_up_min_win_gap then
    select w.profile_id
    into expected_profile
    from public._season_win_table(target_competition_id, null, block_end) w
    where w.wins = bottom_wins;
  end if;

  select *
  into active_grant
  from public.season_bonus_grants
  where kind = 'catch_up'
    and competition_id = target_competition_id
    and round_number = target_logical_round
    and status = 'granted';

  if found and active_grant.profile_id is not distinct from expected_profile then
    return;
  end if;

  if found then
    perform public._season_bonus_reverse(
      active_grant.id,
      coalesce(target_reason, 'Round standings corrected.')
    );
  end if;

  if expected_profile is null or config_row.catch_up_dp <= 0 then
    return;
  end if;

  perform public._season_bonus_grant(
    'catch_up',
    target_competition_id,
    null,
    target_logical_round,
    expected_profile,
    config_row.catch_up_dp,
    'Catch-up bonus — Round ' || target_logical_round,
    jsonb_build_object(
      'wins', bottom_wins,
      'leader_wins', top_wins,
      'schedule_round_end', block_end
    )
  );
end;
$$;

-- ---------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------

create or replace function public._season_bonus_after_match_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  player_count integer;
  cycle_size integer;
  first_round integer;
  settled_round integer;
begin
  if not public._is_season_competition(new.competition_id) then
    return null;
  end if;

  if old.status is distinct from 'completed' then
    -- First completion: snapshot the leader, pay the bounty.
    perform public._record_match_bounty_check(new.id);
    perform public._sync_match_bounty(new.id, null);
    return null;
  end if;

  -- Correction of a completed duel (winner changed).
  perform public._sync_match_bounty(new.id, 'Duel result corrected.');

  if new.round_number is null then
    return null;
  end if;

  select count(*)
  into player_count
  from public.competition_players
  where competition_id = new.competition_id;

  if player_count < 2 then
    return null;
  end if;

  cycle_size := case
    when mod(player_count, 2) = 0 then player_count - 1
    else player_count
  end;

  first_round := ((new.round_number - 1) / cycle_size) + 1;

  for settled_round in
    select distinct g.round_number
    from public.competition_round_reward_grants g
    where g.competition_id = new.competition_id
      and g.reward_role = 'participation'
      and g.status = 'granted'
      and g.round_number >= first_round
    order by g.round_number
  loop
    perform public._sync_round_catch_up(new.competition_id, settled_round, 'Round standings corrected.');
  end loop;

  return null;
end;
$$;

drop trigger if exists matches_season_bonus_after_update on public.matches;

create trigger matches_season_bonus_after_update
after update of status, winner_id on public.matches
for each row
when (
  new.competition_id is not null
  and new.tiebreak_id is null
  and new.status = 'completed'
  and (
    old.status is distinct from new.status
    or old.winner_id is distinct from new.winner_id
  )
)
execute function public._season_bonus_after_match_update();

create or replace function public._season_bonus_after_round_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._sync_round_catch_up(new.competition_id, new.round_number, null);
  return null;
end;
$$;

drop trigger if exists competition_round_reward_grants_catch_up on public.competition_round_reward_grants;

create trigger competition_round_reward_grants_catch_up
after insert on public.competition_round_reward_grants
for each row
when (new.reward_role = 'participation' and new.status = 'granted')
execute function public._season_bonus_after_round_grant();

-- ---------------------------------------------------------
-- Privileges: all internal.
-- ---------------------------------------------------------

revoke all on function public._is_season_competition(uuid) from public, anon, authenticated;
revoke all on function public._season_win_table(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public._season_bonus_grant(text, uuid, uuid, integer, uuid, integer, text, jsonb)
  from public, anon, authenticated;
revoke all on function public._season_bonus_reverse(uuid, text) from public, anon, authenticated;
revoke all on function public._record_match_bounty_check(uuid) from public, anon, authenticated;
revoke all on function public._sync_match_bounty(uuid, text) from public, anon, authenticated;
revoke all on function public._sync_round_catch_up(uuid, integer, text) from public, anon, authenticated;
revoke all on function public._season_bonus_after_match_update() from public, anon, authenticated;
revoke all on function public._season_bonus_after_round_grant() from public, anon, authenticated;
