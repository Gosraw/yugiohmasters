-- =========================================================
-- PASTE INTO THE SUPABASE SQL EDITOR (production), 2026-11-23
--
-- 1. UNDO 20261123_round_dp_halved.sql (owner ran it by mistake:
--    the owner meant the DP per duel, not the DP per round).
--    That file overwrote the round DP (150 / 200 / 150 / 100) in
--    league_economy_defaults and in the rules of every draft/active
--    competition, and the old numbers were not saved. They are
--    recovered here from the round rewards that were already paid
--    out this season (competition_round_reward_grants keeps the DP
--    of every grant): per role the most common amount paid since
--    2026-10-30 that is not the mistaken halved amount. With no paid
--    round to learn from, the approved Season 2 launch numbers are
--    used (300 everyone / +350 / +200 / +100, runbook step 2b).
--    Packs were never touched by the mistaken file.
--
-- 2. Owner decision: DP per duel halved
--    win 100 -> 50, loss 75 -> 35, draw 75 -> 35.
--    Applies to every duel completed from now on; duels already
--    paid keep what they paid.
--
-- Safe to run twice. The last row must say checks_passed = true.
-- =========================================================

begin;

drop table if exists pg_temp.round_dp_restore;

create temp table round_dp_restore as
with launch_numbers(role, dp) as (
  values
    ('participation', 300),
    ('round_winner', 350),
    ('round_runner_up', 200),
    ('round_third', 100)
),
mistaken(role, dp) as (
  values
    ('participation', 150),
    ('round_winner', 200),
    ('round_runner_up', 150),
    ('round_third', 100)
),
paid as (
  select
    g.reward_role as role,
    mode() within group (order by g.duel_points_granted) as dp,
    count(*) as grants_seen
  from public.competition_round_reward_grants g
  join mistaken m
    on m.role = g.reward_role
  where g.status = 'granted'
    and g.granted_at >= date '2026-10-30'
    and g.duel_points_granted <> m.dp
  group by g.reward_role
)
select
  l.role,
  coalesce(p.dp, l.dp) as dp,
  coalesce(p.grants_seen, 0) as grants_seen
from launch_numbers l
left join paid p
  on p.role = l.role;

update public.league_economy_defaults
set
  round_participation_dp = (select dp from round_dp_restore where role = 'participation'),
  round_first_dp = (select dp from round_dp_restore where role = 'round_winner'),
  round_second_dp = (select dp from round_dp_restore where role = 'round_runner_up'),
  round_third_dp = (select dp from round_dp_restore where role = 'round_third'),
  match_win_dp = 50,
  match_loss_dp = 35,
  match_draw_dp = 35,
  updated_at = now();

update public.competition_round_reward_rules as r
set
  duel_points = x.dp,
  updated_at = now()
from round_dp_restore x,
public.competitions c
where r.role = x.role
  and c.id = r.competition_id
  and c.status in ('draft', 'active');

commit;

-- =========================================================
-- VERIFICATION (reads only)
-- =========================================================

select
  d.match_win_dp as duel_win,
  d.match_loss_dp as duel_loss,
  d.match_draw_dp as duel_draw,
  d.round_participation_dp as round_everyone,
  d.round_first_dp as round_first,
  d.round_second_dp as round_second,
  d.round_third_dp as round_third,
  (select sum(grants_seen) from round_dp_restore) as paid_round_rewards_used,
  (
    d.match_win_dp = 50
    and d.match_loss_dp = 35
    and d.match_draw_dp = 35
    and d.round_participation_dp = (select dp from round_dp_restore where role = 'participation')
    and d.round_first_dp = (select dp from round_dp_restore where role = 'round_winner')
    and d.round_second_dp = (select dp from round_dp_restore where role = 'round_runner_up')
    and d.round_third_dp = (select dp from round_dp_restore where role = 'round_third')
    and not exists (
      select 1
      from public.competition_round_reward_rules r
      join public.competitions c
        on c.id = r.competition_id
      join round_dp_restore x
        on x.role = r.role
      where c.status in ('draft', 'active')
        and r.duel_points <> x.dp
    )
  ) as checks_passed
from public.league_economy_defaults d;
