-- =========================================================
-- COMPETITION V2: configurable scheduling, Best of 3, idempotent
-- rewards, auditable correction.
--
-- Builds additively on top of the recovered V1 schema in
-- 202608231045_competition_schema_recovery.sql. Does NOT touch,
-- rename or redefine any of the 8 live V1 RPCs (create_competition,
-- install_default_competition_rewards, add_competition_player,
-- remove_competition_player, start_competition,
-- get_competition_standings, finalize_round_robin_competition,
-- distribute_competition_rewards) - their bodies are unknown and
-- must not be guessed at. Every V2 function below has a distinct
-- name ending in _v2 so it cannot collide with or silently replace
-- V1 behavior. V1 competitions (meetings_per_pairing is null) are
-- untouched by any V2 function - each V2 function's first check is
-- that the competition was actually created via create_competition_v2.
--
-- MODEL
--   COMPETITION -> rounds -> matches (one row per "meeting" in
--   public.matches, tagged competition_id) -> duels (individual
--   games within a match, tracked as counts, not separate rows -
--   see player_one_duel_wins/player_two_duel_wins below).
--
--   Single Duel: one duel decides the match. duel wins are 1-0/0-1.
--   Best of 3: first to 2 duel wins takes the match. Valid final
--   scores are 2-0 and 2-1 only - the third duel is never required
--   after a 2-0.
-- =========================================================

-- ---------------------------------------------------------
-- 1. COMPETITIONS - additive V2 configuration columns
-- ---------------------------------------------------------

alter table public.competitions
  add column if not exists meetings_per_pairing integer,

  add column if not exists match_format text,

  add column if not exists total_rounds integer,

  add column if not exists current_round integer;

alter table public.competitions
  drop constraint if exists competitions_v2_meetings_check;

alter table public.competitions
  add constraint competitions_v2_meetings_check
  check (
    meetings_per_pairing is null
    or meetings_per_pairing >= 1
  );

alter table public.competitions
  drop constraint if exists competitions_v2_match_format_check;

alter table public.competitions
  add constraint competitions_v2_match_format_check
  check (
    match_format is null
    or match_format in ('single_duel', 'best_of_3')
  );

comment on column public.competitions.meetings_per_pairing is
  'V2 only. Null for V1 competitions (created via create_competition). How many times every pair of players meets - 1x/2x/3x/custom.';

comment on column public.competitions.match_format is
  'V2 only. single_duel or best_of_3. Applies to every match in the competition.';

comment on column public.competitions.total_rounds is
  'V2 only. Set once by generate_round_robin_matches_v2 - total distinct rounds across every meeting cycle.';

comment on column public.competitions.current_round is
  'V2 only. Lowest round_number that still has a non-completed match. Null once every round is done.';


-- ---------------------------------------------------------
-- 2. MATCHES - additive V2 columns
-- ---------------------------------------------------------

alter table public.matches
  add column if not exists round_number integer,

  add column if not exists meeting_number integer,

  add column if not exists match_format text
    not null default 'single_duel',

  add column if not exists player_one_duel_wins integer
    not null default 0,

  add column if not exists player_two_duel_wins integer
    not null default 0;

alter table public.matches
  drop constraint if exists matches_v2_format_check;

alter table public.matches
  add constraint matches_v2_format_check
  check (
    match_format in ('single_duel', 'best_of_3')
  );

alter table public.matches
  drop constraint if exists matches_v2_duel_score_check;

alter table public.matches
  add constraint matches_v2_duel_score_check
  check (
    -- Single Duel: exactly one duel decided, 1-0 or 0-1, or not
    -- yet played (0-0).
    (
      match_format = 'single_duel'
      and player_one_duel_wins <= 1
      and player_two_duel_wins <= 1
      and (player_one_duel_wins + player_two_duel_wins) <= 1
    )
    or
    -- Best of 3: only 0-0 (not played), or a legal completed score
    -- (2-0, 2-1, 0-2, 1-2). Never 3-0, never 2-2, never a completed
    -- one-sided partial like 1-0.
    (
      match_format = 'best_of_3'
      and (
        (player_one_duel_wins = 0 and player_two_duel_wins = 0)
        or (player_one_duel_wins = 2 and player_two_duel_wins in (0, 1))
        or (player_two_duel_wins = 2 and player_one_duel_wins in (0, 1))
      )
    )
  );

create index if not exists matches_competition_round_idx
  on public.matches(competition_id, round_number)
  where competition_id is not null;

comment on column public.matches.match_format is
  'single_duel (default, matches V1/casual matches unchanged) or best_of_3. For best_of_3, winner_id/result/status are still set from player_one_duel_wins/player_two_duel_wins once the match completes.';


-- ---------------------------------------------------------
-- 3. COMPETITION REWARD GRANTS - idempotent, auditable payout
--    ledger. Exactly one ACTIVE grant per (competition_id,
--    profile_id) at a time; a correction reverses the old row
--    (status -> reversed, never deleted) and inserts a new one -
--    full history preserved, nothing overwritten in place.
-- ---------------------------------------------------------

create table if not exists public.competition_reward_grants (
  id uuid primary key default gen_random_uuid(),

  competition_id uuid not null
    references public.competitions(id)
    on delete cascade,

  profile_id uuid not null
    references public.profiles(id)
    on delete restrict,

  placement integer not null,

  duel_points_granted integer not null default 0,

  voucher_type text,

  voucher_quantity integer not null default 0,

  duel_point_transaction_id uuid
    references public.duel_point_transactions(id)
    on delete set null,

  status text not null default 'granted',

  granted_at timestamptz not null default now(),

  reversed_at timestamptz,

  reversal_reason text,

  constraint competition_reward_grants_status_check
    check (status in ('granted', 'reversed'))
);

-- Exactly one ACTIVE grant per player per competition at any time -
-- this is the idempotency guarantee distribute_competition_rewards_v2
-- and correct_competition_match_result_v2 both rely on.
create unique index if not exists competition_reward_grants_active_unique
  on public.competition_reward_grants(competition_id, profile_id)
  where status = 'granted';

create index if not exists competition_reward_grants_competition_idx
  on public.competition_reward_grants(competition_id);


-- ---------------------------------------------------------
-- 4. CREATE COMPETITION V2
-- ---------------------------------------------------------

create or replace function public.create_competition_v2(
  target_league_id uuid,
  target_name text,
  target_meetings_per_pairing integer,
  target_match_format text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  return new_competition_id;
end;
$function$;

revoke all on function public.create_competition_v2(uuid, text, integer, text) from public;
grant execute on function public.create_competition_v2(uuid, text, integer, text) to authenticated;


-- ---------------------------------------------------------
-- 5. ADD / REMOVE PLAYER V2 - only for draft V2 competitions.
--    (V1's add/remove_competition_player is left untouched and
--    still works for V1 competitions; these are separate names on
--    purpose.)
-- ---------------------------------------------------------

create or replace function public.add_competition_player_v2(
  target_competition_id uuid,
  target_profile_id uuid
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
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into competition_row
  from public.competitions
  where id = target_competition_id
  for update;

  if not found then
    raise exception 'Competition not found.';
  end if;

  if competition_row.meetings_per_pairing is null then
    raise exception 'This is a V1 competition - use add_competition_player.';
  end if;

  if competition_row.status <> 'draft' then
    raise exception 'Players can only be added while the competition is in draft.';
  end if;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can manage competition players.';
  end if;

  insert into public.competition_players (competition_id, profile_id)
  values (target_competition_id, target_profile_id)
  on conflict (competition_id, profile_id) do nothing;
end;
$function$;

revoke all on function public.add_competition_player_v2(uuid, uuid) from public;
grant execute on function public.add_competition_player_v2(uuid, uuid) to authenticated;


create or replace function public.remove_competition_player_v2(
  target_competition_id uuid,
  target_profile_id uuid
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
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select *
  into competition_row
  from public.competitions
  where id = target_competition_id
  for update;

  if not found then
    raise exception 'Competition not found.';
  end if;

  if competition_row.meetings_per_pairing is null then
    raise exception 'This is a V1 competition - use remove_competition_player.';
  end if;

  if competition_row.status <> 'draft' then
    raise exception 'Players can only be removed while the competition is in draft.';
  end if;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can manage competition players.';
  end if;

  delete from public.competition_players
  where competition_id = target_competition_id
    and profile_id = target_profile_id;
end;
$function$;

revoke all on function public.remove_competition_player_v2(uuid, uuid) from public;
grant execute on function public.remove_competition_player_v2(uuid, uuid) to authenticated;


-- ---------------------------------------------------------
-- 6. ROUND ROBIN GENERATOR (circle/polygon method)
--
-- Players ordered deterministically by profile_id. If odd, a null
-- "bye" seat is appended. Player[1] is fixed; the remaining seats
-- rotate by one position every round. Every round is itself a full
-- legal round-robin round (no player plays twice in the same
-- round, by construction of the method - not by a runtime check).
--
-- meetings_per_pairing > 1: the whole rotation resets to its
-- original order at the start of every cycle, so cycle 2 repeats
-- the exact same per-round pairing shape as cycle 1, just at
-- round_number + rounds_per_cycle. This spreads a pairing's
-- repeat meetings across widely-separated rounds (e.g. round 1,
-- 4, 7 for a 3-round cycle) instead of clustering them.
--
-- Idempotent: a no-op if this competition already has matches.
-- ---------------------------------------------------------

create or replace function public.generate_round_robin_matches_v2(
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
  player_ids uuid[];
  n int;
  fixed_player uuid;
  rotating uuid[];
  m int;
  rounds_per_cycle int;
  cycle_i int;
  round_i int;
  cumulative_round int := 0;
  k int;
  a uuid;
  b uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  perform pg_advisory_xact_lock(hashtext('competition_generate_' || target_competition_id::text));

  select * into competition_row
  from public.competitions
  where id = target_competition_id
  for update;

  if not found then
    raise exception 'Competition not found.';
  end if;

  if competition_row.meetings_per_pairing is null then
    raise exception 'This is a V1 competition - round robin generation is V2 only.';
  end if;

  if competition_row.status <> 'draft' then
    raise exception 'Matches can only be generated for a draft competition.';
  end if;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can start a competition.';
  end if;

  -- Idempotent: already generated (e.g. a retried/duplicate start call).
  if exists (
    select 1 from public.matches where competition_id = target_competition_id
  ) then
    update public.competitions
    set status = 'active', starts_at = coalesce(starts_at, now()), updated_at = now()
    where id = target_competition_id and status = 'draft';
    return;
  end if;

  select array_agg(profile_id order by profile_id)
  into player_ids
  from public.competition_players
  where competition_id = target_competition_id;

  n := coalesce(array_length(player_ids, 1), 0);

  if n < 2 then
    raise exception 'A competition needs at least 2 players.';
  end if;

  if n % 2 = 1 then
    player_ids := player_ids || array[null::uuid];
    n := n + 1;
  end if;

  fixed_player := player_ids[1];
  rotating := player_ids[2:n];
  m := n - 1;
  rounds_per_cycle := n - 1;

  for cycle_i in 1..competition_row.meetings_per_pairing loop
    rotating := player_ids[2:n];

    for round_i in 1..rounds_per_cycle loop
      cumulative_round := cumulative_round + 1;

      a := fixed_player;
      b := rotating[1];

      if a is not null and b is not null then
        insert into public.matches (
          league_id, created_by, player_one_id, player_two_id,
          match_type, status, competition_id, round_number,
          meeting_number, match_format
        ) values (
          competition_row.league_id, current_user_id, a, b,
          'league', 'pending', target_competition_id, cumulative_round,
          cycle_i, competition_row.match_format
        );
      end if;

      for k in 2..(n / 2) loop
        a := rotating[k];
        b := rotating[m - k + 2];

        if a is not null and b is not null then
          insert into public.matches (
            league_id, created_by, player_one_id, player_two_id,
            match_type, status, competition_id, round_number,
            meeting_number, match_format
          ) values (
            competition_row.league_id, current_user_id, a, b,
            'league', 'pending', target_competition_id, cumulative_round,
            cycle_i, competition_row.match_format
          );
        end if;
      end loop;

      rotating := array_prepend(rotating[m], rotating[1:m - 1]);
    end loop;
  end loop;

  update public.competitions
  set
    status = 'active',
    starts_at = coalesce(starts_at, now()),
    total_rounds = cumulative_round,
    current_round = 1,
    updated_at = now()
  where id = target_competition_id;
end;
$function$;

revoke all on function public.generate_round_robin_matches_v2(uuid) from public;
grant execute on function public.generate_round_robin_matches_v2(uuid) to authenticated;


-- ---------------------------------------------------------
-- 7. CURRENT ROUND REFRESH (small helper, reused by result
--    submission and correction)
-- ---------------------------------------------------------

create or replace function public.refresh_competition_current_round_v2(
  target_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  next_round int;
begin
  select min(round_number)
  into next_round
  from public.matches
  where competition_id = target_competition_id
    and status <> 'completed';

  update public.competitions
  set current_round = next_round, updated_at = now()
  where id = target_competition_id;
end;
$function$;

revoke all on function public.refresh_competition_current_round_v2(uuid) from public;
grant execute on function public.refresh_competition_current_round_v2(uuid) to authenticated;


-- ---------------------------------------------------------
-- 8. STANDINGS (V2)
--
-- points: win = 3, draw = 1, loss = 0 (same rule already shown in
-- the V1 UI caption - "Win = 3 points, Draw = 1, Loss = 0" - reused
-- verbatim rather than invented).
--
-- Tiebreakers, in order:
--   1. competition points
--   2. head-to-head score: wins earned specifically against other
--      players tied on points (a simple, deterministic
--      approximation of full head-to-head - it does not attempt
--      iterative regrouping for a remaining sub-tie inside an
--      already-tied group; any such sub-tie falls through cleanly
--      to duel differential, which is itself exact)
--   3. duel differential (duel wins - duel losses, across every
--      match)
--   4. duel wins (total)
--   5. profile_id ascending (deterministic fallback - guarantees no
--      tie ever survives to the final ranking)
--
-- draws is always 0 for V2 matches by construction (both
-- single_duel and best_of_3 always produce a winner - see
-- matches_v2_duel_score_check), kept in the return shape only for
-- compatibility with the V1 Standing type already used by the UI.
-- ---------------------------------------------------------

create or replace function public.get_competition_standings_v2(
  target_competition_id uuid
)
returns table (
  profile_id uuid,
  played integer,
  wins integer,
  losses integer,
  draws integer,
  points integer,
  duel_wins integer,
  duel_losses integer,
  duel_differential integer,
  head_to_head_score integer,
  placement integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with participants as (
    select profile_id
    from public.competition_players
    where competition_id = target_competition_id
  ),
  completed as (
    select *
    from public.matches
    where competition_id = target_competition_id
      and status = 'completed'
  ),
  per_match as (
    select
      player_one_id as profile_id,
      case when winner_id = player_one_id then 1 else 0 end as win,
      case when winner_id = player_two_id then 1 else 0 end as loss,
      case when winner_id is null then 1 else 0 end as draw,
      player_one_duel_wins as duel_wins,
      player_two_duel_wins as duel_losses,
      player_two_id as opponent_id
    from completed
    union all
    select
      player_two_id as profile_id,
      case when winner_id = player_two_id then 1 else 0 end as win,
      case when winner_id = player_one_id then 1 else 0 end as loss,
      case when winner_id is null then 1 else 0 end as draw,
      player_two_duel_wins as duel_wins,
      player_one_duel_wins as duel_losses,
      player_one_id as opponent_id
    from completed
  ),
  totals as (
    select
      p.profile_id,
      coalesce(sum(m.win), 0)::int as wins,
      coalesce(sum(m.loss), 0)::int as losses,
      coalesce(sum(m.draw), 0)::int as draws,
      count(m.opponent_id)::int as played,
      (coalesce(sum(m.win), 0) * 3 + coalesce(sum(m.draw), 0))::int as points,
      coalesce(sum(m.duel_wins), 0)::int as duel_wins,
      coalesce(sum(m.duel_losses), 0)::int as duel_losses,
      (coalesce(sum(m.duel_wins), 0) - coalesce(sum(m.duel_losses), 0))::int as duel_differential
    from participants p
    left join per_match m on m.profile_id = p.profile_id
    group by p.profile_id
  ),
  head_to_head as (
    select
      t.profile_id,
      coalesce(sum(
        case
          when m.opponent_id is not null and opp.profile_id is not null
          then m.win
          else 0
        end
      ), 0)::int as head_to_head_score
    from totals t
    left join per_match m on m.profile_id = t.profile_id
    left join totals opp on opp.profile_id = m.opponent_id and opp.points = t.points
    group by t.profile_id
  )
  select
    t.profile_id,
    t.played,
    t.wins,
    t.losses,
    t.draws,
    t.points,
    t.duel_wins,
    t.duel_losses,
    t.duel_differential,
    h.head_to_head_score,
    (row_number() over (
      order by
        t.points desc,
        h.head_to_head_score desc,
        t.duel_differential desc,
        t.duel_wins desc,
        t.profile_id asc
    ))::int as placement
  from totals t
  join head_to_head h on h.profile_id = t.profile_id
  order by placement asc;
$function$;

revoke all on function public.get_competition_standings_v2(uuid) from public;
grant execute on function public.get_competition_standings_v2(uuid) to authenticated;


-- ---------------------------------------------------------
-- 9. RESULT ENTRY (first-time)
-- ---------------------------------------------------------

create or replace function public.submit_competition_match_result_v2(
  target_match_id uuid,
  target_player_one_duel_wins integer,
  target_player_two_duel_wins integer
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
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into match_row from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.competition_id is null then
    raise exception 'This match is not part of a competition.';
  end if;

  select * into competition_row from public.competitions where id = match_row.competition_id;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can submit competition results.';
  end if;

  if match_row.status = 'completed' then
    raise exception 'This match already has a result - use correct_competition_match_result_v2 to change it.';
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
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where id = target_match_id;

  perform public.refresh_competition_current_round_v2(match_row.competition_id);
end;
$function$;

revoke all on function public.submit_competition_match_result_v2(uuid, integer, integer) from public;
grant execute on function public.submit_competition_match_result_v2(uuid, integer, integer) to authenticated;


-- ---------------------------------------------------------
-- 10. FINALIZE (idempotent)
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

  perform pg_advisory_xact_lock(hashtext('competition_finalize_' || target_competition_id::text));

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
-- 11. REWARD DISTRIBUTION (idempotent)
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
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  perform pg_advisory_xact_lock(hashtext('competition_rewards_' || target_competition_id::text));

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
          'placement', result_row.placement
        )
      )
      returning id into new_tx_id;
    end if;

    if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
      insert into public.reward_vouchers (
        profile_id, voucher_type, quantity, source_type, source_id
      ) values (
        result_row.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
        'competition_reward', target_competition_id
      );
    end if;

    insert into public.competition_reward_grants (
      competition_id, profile_id, placement, duel_points_granted,
      voucher_type, voucher_quantity, duel_point_transaction_id, status
    ) values (
      target_competition_id, result_row.profile_id, result_row.placement,
      coalesce(rule_row.duel_points, 0), rule_row.voucher_type,
      coalesce(rule_row.voucher_quantity, 0), new_tx_id, 'granted'
    );
  end loop;

  update public.competitions
  set rewards_distributed_at = coalesce(rewards_distributed_at, now())
  where id = target_competition_id;
end;
$function$;

revoke all on function public.distribute_competition_rewards_v2(uuid) from public;
grant execute on function public.distribute_competition_rewards_v2(uuid) to authenticated;


-- ---------------------------------------------------------
-- 12. RESULT CORRECTION - compensating transactions, fully
--     auditable. Never overwrites a DP balance directly: reverses
--     the old grant (if any) with a negative
--     duel_point_transactions row and marks the old
--     competition_reward_grants row 'reversed' (kept, never
--     deleted), then grants the new placement's reward the normal
--     way. If the competition has not been finalized yet, standings
--     are computed live so there is nothing to reconcile - only the
--     match itself is corrected.
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
  reversal_tx_id uuid;
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

  perform pg_advisory_xact_lock(hashtext('competition_finalize_' || match_row.competition_id::text));

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

        if old_grant.duel_points_granted > 0 then
          update public.profiles
          set duel_points = greatest(0, duel_points - old_grant.duel_points_granted), updated_at = now()
          where id = new_standing.profile_id
          returning duel_points into new_balance;

          insert into public.duel_point_transactions (
            profile_id, amount, balance_after, reason, metadata
          ) values (
            new_standing.profile_id, -old_grant.duel_points_granted, new_balance,
            'competition_reward_reversal',
            jsonb_build_object(
              'competition_id', match_row.competition_id,
              'previous_placement', old_grant.placement,
              'reason', target_reason
            )
          )
          returning id into reversal_tx_id;
        end if;

        update public.competition_reward_grants
        set status = 'reversed', reversed_at = now(), reversal_reason = target_reason
        where id = old_grant.id;
      end if;

      select * into rule_row
      from public.competition_reward_rules
      where competition_id = match_row.competition_id
        and placement = new_standing.placement;

      if found then
        new_tx_id := null;

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
              'correction_reason', target_reason
            )
          )
          returning id into new_tx_id;
        end if;

        if rule_row.voucher_type is not null and rule_row.voucher_quantity > 0 then
          insert into public.reward_vouchers (
            profile_id, voucher_type, quantity, source_type, source_id
          ) values (
            new_standing.profile_id, rule_row.voucher_type, rule_row.voucher_quantity,
            'competition_reward_correction', match_row.competition_id
          );
        end if;

        insert into public.competition_reward_grants (
          competition_id, profile_id, placement, duel_points_granted,
          voucher_type, voucher_quantity, duel_point_transaction_id, status
        ) values (
          match_row.competition_id, new_standing.profile_id, new_standing.placement,
          coalesce(rule_row.duel_points, 0), rule_row.voucher_type,
          coalesce(rule_row.voucher_quantity, 0), new_tx_id, 'granted'
        );
      end if;
    end if;
  end loop;
end;
$function$;

revoke all on function public.correct_competition_match_result_v2(uuid, integer, integer, text) from public;
grant execute on function public.correct_competition_match_result_v2(uuid, integer, integer, text) to authenticated;
