-- =========================================================
-- COMPETITION TIEBREAKS (2026-08-27) - Track 3
--
-- get_competition_standings_v2's own tiebreak chain (points ->
-- head_to_head_score -> duel_differential -> duel_wins ->
-- profile_id ascending) already falls back to an ARBITRARY,
-- meaningless ordering (profile_id ascending) whenever two or three
-- players are genuinely, fully tied on every real criterion. This
-- file replaces that arbitrary fallback, for the two shapes the
-- product spec defines, with a real deciding match / sudden-death
-- phase:
--
--   - 2-PLAYER FULL TIE: one winner-takes-all deciding match. The
--     winner ranks above the loser. The competition cannot be
--     finalized before that match is completed.
--   - 3-PLAYER FULL TIE: sudden death. Players play one match at a
--     time; whoever wins TWO CONSECUTIVE matches (necessarily against
--     two different opponents, by construction - see
--     start_competition_tiebreak below) resolves the tie and takes
--     the top spot among the three. A new (different) winner resets
--     the streak to 1. The competition cannot be finalized before
--     this resolves.
--   - A tie among 4+ players is NOT handled by this feature (out of
--     the product spec's defined scope) - it still falls through to
--     the old profile_id-ascending fallback, same as before. This is
--     a documented, deliberate limitation, not an oversight.
--
-- DRAW HANDLING (explicit, documented rule): a tiebreak match can
-- NEVER be recorded as a draw. submit_competition_tiebreak_match_
-- result reuses the exact same score validation as
-- submit_competition_match_result_v2 (single_duel requires 1-0/0-1;
-- best_of_3 requires a first-to-2 score) - there is no input shape
-- that represents an undecided result. If a physical duel is
-- genuinely undecided (e.g. a real-world time-out with no winner),
-- the admin does not submit a result for it at all - the tiebreak
-- stays at its current state (no streak change) until a decisive
-- replay of THE SAME matchup is submitted instead. This mirrors how
-- ordinary competition matches already work (submit_competition_
-- match_result_v2 has never accepted a draw either).
--
-- SCOPE NOTE - tiebreak matches are informational deciders, not
-- ordinary league matches: they are created with match_type =
-- 'practice' (which already means "no automatic match DP" per
-- award_match_duel_points/2_award_match_duel_points_internal's
-- existing practice-match short-circuit) and are explicitly excluded
-- from get_competition_standings_v2's own match totals (see the
-- `and tiebreak_id is null` filter added below) so they never
-- pollute a player's regular win/loss/points/duel-differential
-- record - their ONLY effect is on final PLACEMENT (and, downstream,
-- placement-based competition rewards) for the specific players they
-- resolve. This is a deliberate, bounded scope decision: inventing a
-- new DP amount for a decider match was not asked for by the spec,
-- and doing so would risk a reward amount nobody actually asked for.
--
-- KNOWN LIMITATION - correct_competition_match_result_v2 is NOT
-- changed to re-open or re-evaluate an already-resolved tiebreak if
-- correcting a REGULAR match after finalization would change who is
-- tied. This is a rare edge case (correcting a match after the
-- competition's tiebreaks have already been played and resolved) the
-- product spec does not define a rule for; an admin hitting this
-- specific scenario needs to reconcile competition_results manually.
-- Every other path (initial finalize, the common case) is fully
-- handled below.
-- =========================================================


-- ---------------------------------------------------------
-- 1. SCHEMA
-- ---------------------------------------------------------

create table if not exists public.competition_tiebreaks (
  id uuid primary key default gen_random_uuid(),

  competition_id uuid not null
    references public.competitions(id)
    on delete cascade,

  -- Sorted ascending (by profile_id) at creation time - this is what
  -- makes the unique constraint below a reliable "has this exact
  -- group already been recorded" check regardless of insertion order.
  tied_profile_ids uuid[] not null,

  tie_size integer not null,

  status text not null default 'pending',

  -- Sudden-death state (3-player only; stays null/0 for a 2-player
  -- tie, which resolves in a single match with no streak concept).
  streak_holder_id uuid
    references public.profiles(id)
    on delete restrict,

  streak_count integer not null default 0,

  -- Final rank order within this tied group, best first, set exactly
  -- once when status transitions to 'resolved'. Never null afterward.
  resolved_order uuid[],

  created_at timestamptz not null default now(),
  resolved_at timestamptz,

  constraint competition_tiebreaks_tie_size_check
    check (tie_size in (2, 3)),

  constraint competition_tiebreaks_status_check
    check (status in ('pending', 'in_progress', 'resolved')),

  constraint competition_tiebreaks_unique
    unique (competition_id, tied_profile_ids)
);

create index if not exists competition_tiebreaks_competition_idx
  on public.competition_tiebreaks(competition_id);

alter table public.matches
  add column if not exists tiebreak_id uuid
    references public.competition_tiebreaks(id)
    on delete set null;

create index if not exists matches_tiebreak_idx
  on public.matches(tiebreak_id)
  where tiebreak_id is not null;

-- Same governance as every other competition table (Track 7 finding
-- #2) - never leave a new table ungoverned. Read: league members
-- only. Write: no direct client access at all - every mutation goes
-- through the SECURITY DEFINER functions below.
alter table public.competition_tiebreaks enable row level security;

drop policy if exists competition_tiebreaks_select_league_member on public.competition_tiebreaks;
create policy competition_tiebreaks_select_league_member on public.competition_tiebreaks
  for select to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_tiebreaks.competition_id
        and public.is_league_member(c.league_id)
    )
  );

revoke insert, update, delete on public.competition_tiebreaks from authenticated;
grant select on public.competition_tiebreaks to authenticated;


-- ---------------------------------------------------------
-- 2. get_competition_standings_v2 - exclude tiebreak matches from
--    the regular win/loss/points/duel-differential totals. Only the
--    `completed` CTE's filter changes (one added predicate); every
--    other line is byte-for-byte identical to 202608231100's version.
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
      -- Tiebreak deciders are NOT part of the regular standings -
      -- see this migration's header (SCOPE NOTE).
      and tiebreak_id is null
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
-- 3. get_final_competition_standings_v2 - the base standings above,
--    with any RESOLVED tiebreak group's internal order overridden by
--    its resolved_order (same block of placements, reordered within
--    the block). A group with no resolved tiebreak keeps the base
--    function's own placement unchanged. finalize_competition_v2 (5,
--    below) uses this instead of the base function when writing
--    competition_results.
-- ---------------------------------------------------------

create or replace function public.get_final_competition_standings_v2(
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
  with base as (
    select * from public.get_competition_standings_v2(target_competition_id)
  ),
  tiebreak_lookup as (
    select
      ct.id as tiebreak_id,
      x.profile_id,
      x.ord::int as order_index
    from public.competition_tiebreaks ct
    cross join lateral unnest(ct.resolved_order) with ordinality as x(profile_id, ord)
    where ct.competition_id = target_competition_id
      and ct.status = 'resolved'
  ),
  block_starts as (
    select tl.tiebreak_id, min(b.placement) as block_start
    from tiebreak_lookup tl
    join base b on b.profile_id = tl.profile_id
    group by tl.tiebreak_id
  )
  select
    b.profile_id,
    b.played,
    b.wins,
    b.losses,
    b.draws,
    b.points,
    b.duel_wins,
    b.duel_losses,
    b.duel_differential,
    b.head_to_head_score,
    coalesce(bs.block_start + tl.order_index - 1, b.placement)::int as placement
  from base b
  left join tiebreak_lookup tl on tl.profile_id = b.profile_id
  left join block_starts bs on bs.tiebreak_id = tl.tiebreak_id
  order by placement asc;
$function$;

revoke all on function public.get_final_competition_standings_v2(uuid) from public;
grant execute on function public.get_final_competition_standings_v2(uuid) to authenticated;


-- ---------------------------------------------------------
-- 4. TIE DETECTION - scans the base standings for groups of exactly
--    2 or 3 players sharing an identical (points, head_to_head_score,
--    duel_differential, duel_wins) tuple - i.e. groups the base
--    function could only separate via the arbitrary profile_id-
--    ascending fallback - and records one competition_tiebreaks row
--    per group. Idempotent (on conflict do nothing on the exact
--    tied-group unique constraint) - safe to call repeatedly,
--    including automatically from finalize_competition_v2 every time
--    it's attempted.
-- ---------------------------------------------------------

create or replace function public.detect_and_create_competition_tiebreaks(
  target_competition_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  tie_group record;
  created_count integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into competition_row from public.competitions where id = target_competition_id;

  if not found then
    raise exception 'Competition not found.';
  end if;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can check for competition tiebreaks.';
  end if;

  for tie_group in
    select
      array_agg(profile_id order by profile_id) as profile_ids,
      count(*)::int as tie_size
    from public.get_competition_standings_v2(target_competition_id)
    group by points, head_to_head_score, duel_differential, duel_wins
    having count(*) in (2, 3)
  loop
    insert into public.competition_tiebreaks (
      competition_id, tied_profile_ids, tie_size, status
    ) values (
      target_competition_id, tie_group.profile_ids, tie_group.tie_size, 'pending'
    )
    on conflict (competition_id, tied_profile_ids) do nothing;

    if found then
      created_count := created_count + 1;
    end if;
  end loop;

  return created_count;
end;
$function$;

revoke all on function public.detect_and_create_competition_tiebreaks(uuid) from public;
grant execute on function public.detect_and_create_competition_tiebreaks(uuid) to authenticated;


-- ---------------------------------------------------------
-- 5. finalize_competition_v2 - now detects tiebreaks before
--    finalizing, refuses to finalize while any are unresolved, and
--    writes competition_results from the TIEBREAK-AWARE final
--    standings rather than the base function. Everything else is
--    byte-for-byte identical to 202608231400's version.
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
  unresolved_tiebreak_count integer;
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

  -- Track 3: detect any new full ties (2 or 3 players) and refuse to
  -- finalize while any tiebreak for this competition - new or
  -- already in progress - is not yet resolved.
  perform public.detect_and_create_competition_tiebreaks(target_competition_id);

  select count(*)
  into unresolved_tiebreak_count
  from public.competition_tiebreaks
  where competition_id = target_competition_id
    and status <> 'resolved';

  if unresolved_tiebreak_count > 0 then
    raise exception 'Cannot finalize: % tiebreak(s) are not resolved yet. Start and play the deciding match(es) first.', unresolved_tiebreak_count;
  end if;

  delete from public.competition_results where competition_id = target_competition_id;

  insert into public.competition_results (
    competition_id, profile_id, placement, wins, losses, draws, points
  )
  select
    target_competition_id, s.profile_id, s.placement, s.wins, s.losses, s.draws, s.points
  from public.get_final_competition_standings_v2(target_competition_id) s;

  update public.competitions
  set status = 'completed', completed_at = now(), current_round = null, updated_at = now()
  where id = target_competition_id;
end;
$function$;

revoke all on function public.finalize_competition_v2(uuid) from public;
grant execute on function public.finalize_competition_v2(uuid) to authenticated;


-- ---------------------------------------------------------
-- 6. START A TIEBREAK MATCH.
--
--    2-player: the one, single, winner-takes-all match - calling
--    this a second time (after that match is completed) raises,
--    since the tiebreak is already 'resolved' by then.
--
--    3-player sudden death: the FIRST match is between the first two
--    (sorted) tied players - the third sits out. Every match after
--    that pits the current streak holder against whichever of the
--    three tied players did NOT play in the most recently completed
--    tiebreak match (i.e. who sat out last time) - the previous
--    match's loser sits out next. This guarantees the streak
--    holder's two consecutive wins (whenever the tie resolves) are
--    always against two DIFFERENT opponents, which is what makes
--    "the winner's last two wins" a well-defined, unambiguous 2nd/3rd
--    placement rule in submit_competition_tiebreak_match_result below.
-- ---------------------------------------------------------

create or replace function public.start_competition_tiebreak(
  target_tiebreak_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid;
  tiebreak_row public.competition_tiebreaks%rowtype;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  existing_open_match_id uuid;
  player_a uuid;
  player_b uuid;
  last_p1 uuid;
  last_p2 uuid;
  new_match_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into tiebreak_row from public.competition_tiebreaks where id = target_tiebreak_id for update;

  if not found then
    raise exception 'Tiebreak not found.';
  end if;

  select * into competition_row from public.competitions where id = tiebreak_row.competition_id;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can start a tiebreak match.';
  end if;

  if tiebreak_row.status = 'resolved' then
    raise exception 'This tiebreak has already been resolved.';
  end if;

  select id into existing_open_match_id
  from public.matches
  where tiebreak_id = target_tiebreak_id
    and status <> 'completed'
  limit 1;

  if existing_open_match_id is not null then
    raise exception 'A tiebreak match is already pending - submit its result before starting another.';
  end if;

  if tiebreak_row.tie_size = 2 then
    player_a := tiebreak_row.tied_profile_ids[1];
    player_b := tiebreak_row.tied_profile_ids[2];
  else
    if tiebreak_row.streak_holder_id is null then
      -- Very first tiebreak match: the first two sorted players play,
      -- the third sits out.
      player_a := tiebreak_row.tied_profile_ids[1];
      player_b := tiebreak_row.tied_profile_ids[2];
    else
      select player_one_id, player_two_id
      into last_p1, last_p2
      from public.matches
      where tiebreak_id = target_tiebreak_id
        and status = 'completed'
      order by completed_at desc
      limit 1;

      if last_p1 is null then
        raise exception 'Tiebreak has a streak holder but no completed match - data inconsistency.';
      end if;

      player_a := tiebreak_row.streak_holder_id;

      select p into player_b
      from unnest(tiebreak_row.tied_profile_ids) as p
      where p <> last_p1 and p <> last_p2;

      if player_b is null then
        raise exception 'Could not determine the next tiebreak opponent - data inconsistency.';
      end if;
    end if;
  end if;

  insert into public.matches (
    league_id, created_by, player_one_id, player_two_id,
    match_type, status, competition_id, match_format, tiebreak_id
  ) values (
    competition_row.league_id, current_user_id, player_a, player_b,
    'practice', 'pending', tiebreak_row.competition_id, competition_row.match_format, target_tiebreak_id
  )
  returning id into new_match_id;

  update public.competition_tiebreaks
  set status = 'in_progress'
  where id = target_tiebreak_id;

  return new_match_id;
end;
$function$;

revoke all on function public.start_competition_tiebreak(uuid) from public;
grant execute on function public.start_competition_tiebreak(uuid) to authenticated;


-- ---------------------------------------------------------
-- 7. SUBMIT A TIEBREAK MATCH RESULT.
--
--    Same score validation as submit_competition_match_result_v2 (no
--    draw is representable - see this migration's header). Records
--    the match as completed with match_type = 'practice' (no
--    automatic match DP - see SCOPE NOTE above), then advances the
--    owning tiebreak's state:
--      - tie_size = 2: resolves immediately. resolved_order =
--        [winner, loser].
--      - tie_size = 3: same winner as the current streak holder ->
--        streak_count += 1; a DIFFERENT winner -> streak resets to
--        that new winner with streak_count = 1. streak_count reaching
--        2 resolves the tie: resolved_order = [winner, the opponent
--        beaten in the winner's most recent win, the opponent beaten
--        in the win before that] - always well-defined per the
--        opponent-rotation guarantee in start_competition_tiebreak.
-- ---------------------------------------------------------

create or replace function public.submit_competition_tiebreak_match_result(
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
  tiebreak_row public.competition_tiebreaks%rowtype;
  competition_row public.competitions%rowtype;
  is_admin boolean;
  computed_winner uuid;
  computed_loser uuid;
  computed_result public.match_result_type;
  most_recent_opponent uuid;
  second_most_recent_opponent uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select * into match_row from public.matches where id = target_match_id for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if match_row.tiebreak_id is null then
    raise exception 'This match is not a tiebreak match - use submit_competition_match_result_v2.';
  end if;

  if match_row.status = 'completed' then
    raise exception 'This tiebreak match already has a result.';
  end if;

  select * into tiebreak_row from public.competition_tiebreaks where id = match_row.tiebreak_id for update;
  select * into competition_row from public.competitions where id = tiebreak_row.competition_id;

  select (role = 'admin')
  into is_admin
  from public.league_members
  where league_id = competition_row.league_id
    and profile_id = current_user_id;

  if is_admin is not true then
    raise exception 'Only a league admin can submit tiebreak results.';
  end if;

  if tiebreak_row.status = 'resolved' then
    raise exception 'This tiebreak has already been resolved.';
  end if;

  -- DRAW HANDLING: identical validation to submit_competition_match_
  -- result_v2 - no score combination here represents an undecided
  -- result. See this migration's header for the documented rule.
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
    computed_loser := match_row.player_two_id;
    computed_result := 'player_one_win';
  else
    computed_winner := match_row.player_two_id;
    computed_loser := match_row.player_one_id;
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

  if tiebreak_row.tie_size = 2 then
    update public.competition_tiebreaks
    set
      status = 'resolved',
      resolved_order = array[computed_winner, computed_loser],
      resolved_at = now()
    where id = tiebreak_row.id;
    return;
  end if;

  -- tie_size = 3: sudden death streak tracking.
  if tiebreak_row.streak_holder_id is null or tiebreak_row.streak_holder_id <> computed_winner then
    update public.competition_tiebreaks
    set streak_holder_id = computed_winner, streak_count = 1
    where id = tiebreak_row.id;
    return;
  end if;

  -- Same winner as before -> streak continues.
  if tiebreak_row.streak_count + 1 < 2 then
    update public.competition_tiebreaks
    set streak_count = tiebreak_row.streak_count + 1
    where id = tiebreak_row.id;
    return;
  end if;

  -- Streak reaches 2 consecutive wins - resolved. The winner's most
  -- recent two wins (this one plus the one before it) are, by
  -- construction (see start_competition_tiebreak), against the two
  -- DIFFERENT other tied players - so this is always well-defined.
  most_recent_opponent := computed_loser;

  select case when player_one_id = computed_winner then player_two_id else player_one_id end
  into second_most_recent_opponent
  from public.matches
  where tiebreak_id = tiebreak_row.id
    and status = 'completed'
    and id <> target_match_id
    and (player_one_id = computed_winner or player_two_id = computed_winner)
  order by completed_at desc
  limit 1;

  if second_most_recent_opponent is null then
    raise exception 'Could not determine the tiebreak''s prior deciding match - data inconsistency.';
  end if;

  update public.competition_tiebreaks
  set
    status = 'resolved',
    streak_count = tiebreak_row.streak_count + 1,
    resolved_order = array[computed_winner, most_recent_opponent, second_most_recent_opponent],
    resolved_at = now()
  where id = tiebreak_row.id;
end;
$function$;

revoke all on function public.submit_competition_tiebreak_match_result(uuid, integer, integer) from public;
grant execute on function public.submit_competition_tiebreak_match_result(uuid, integer, integer) to authenticated;
