-- =========================================================
-- PASTE INTO THE SUPABASE SQL EDITOR (production), 2026-11-23
--
-- Owner request: the competition was played, but one player ("faro")
-- no longer answers, so the results he has to confirm stay stuck
-- on "waiting for confirmation" (status 'result_submitted') - no
-- DP, no round rewards, no standings.
--
-- This confirms, on the owner's behalf, every season duel in an
-- ACTIVE competition that is waiting for a confirmation from a
-- player whose username starts with "far" (faro / fardin). It uses
-- the exact result that was submitted (nothing is changed) and runs
-- the normal completion path _apply_competition_match_result, so
-- duel DP, round rewards, bounty, catch-up, XP, weekly goals and the
-- automatic finalize all happen exactly as if he had tapped
-- "Confirm". result_confirmed_by stays empty (he did not confirm).
--
-- Disputed duels and duels without a result are NOT touched.
-- Duels waiting on someone else are only listed, not confirmed.
--
-- Stops without changing anything if the round DP still has the
-- mistaken halved numbers: run
-- 20261123_restore_round_dp_halve_match_dp.sql first.
--
-- Safe to run twice (a confirmed duel is no longer waiting).
-- The result lists every duel: "confirmed now" or "still waiting".
-- =========================================================

begin;

do $$
begin
  if exists (
    select 1
    from public.league_economy_defaults
    where round_participation_dp = 150
      and round_first_dp = 200
      and round_second_dp = 150
  ) then
    raise exception 'Run 20261123_restore_round_dp_halve_match_dp.sql first (round DP is still the mistaken halved numbers). Nothing was changed.';
  end if;
end;
$$;

drop table if exists pg_temp.faro_confirmations;

create temp table faro_confirmations as
select
  m.id as match_id,
  m.competition_id,
  m.round_number,
  m.player_one_duel_wins,
  m.player_two_duel_wins,
  m.result_submitted_by,
  case
    when m.result_submitted_by = m.player_one_id then m.player_two_id
    else m.player_one_id
  end as waiting_on_id
from public.matches m
join public.competitions c
  on c.id = m.competition_id
where m.status = 'result_submitted'
  and m.tiebreak_id is null
  and c.status = 'active';

alter table faro_confirmations
  add column confirmed_now boolean not null default false;

update faro_confirmations f
set confirmed_now = true
from public.profiles p
where p.id = f.waiting_on_id
  and p.username ilike 'far%';

do $$
declare
  row_to_confirm record;
begin
  for row_to_confirm in
    select *
    from faro_confirmations
    where confirmed_now
    order by competition_id, round_number, match_id
  loop
    perform public._apply_competition_match_result(
      row_to_confirm.match_id,
      row_to_confirm.player_one_duel_wins,
      row_to_confirm.player_two_duel_wins,
      row_to_confirm.result_submitted_by,
      null
    );
  end loop;
end;
$$;

commit;

-- =========================================================
-- RESULT (reads only)
-- =========================================================

select
  case
    when f.confirmed_now and m.status = 'completed' then 'confirmed now'
    else 'still waiting'
  end as what_happened,
  c.name as competition,
  m.round_number as schedule_round,
  p1.username || ' vs ' || p2.username as duel,
  w.username as winner,
  s.username as entered_by,
  wo.username as was_waiting_on
from faro_confirmations f
join public.matches m on m.id = f.match_id
join public.competitions c on c.id = m.competition_id
join public.profiles p1 on p1.id = m.player_one_id
join public.profiles p2 on p2.id = m.player_two_id
left join public.profiles w on w.id = m.winner_id
left join public.profiles s on s.id = f.result_submitted_by
join public.profiles wo on wo.id = f.waiting_on_id
order by what_happened, m.round_number;
