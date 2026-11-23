-- =========================================================
-- PASTE INTO THE SUPABASE SQL EDITOR (production), 2026-11-23
--
-- Round rewards (after every full round = everyone played everyone
-- once), owner decision: the DP is halved.
--   * everyone (participation)  -> 150 DP
--   * #1 (round_winner)         -> +200 DP
--   * #2 (round_runner_up)      -> +150 DP
--   * #3 (round_third)          -> +100 DP
--
-- Only DP changes. The packs stay exactly as they are (everyone
-- still gets their pack, #1 still gets the extra pack), and match DP
-- (100 win / 75 loss) is untouched.
--
-- Two places hold these numbers:
--   1. league_economy_defaults: used for every NEW competition.
--   2. competition_round_reward_rules: each competition keeps its
--      own copy, so the draft/active ones are updated too (completed
--      and cancelled ones are left alone as history).
-- Rounds that were already paid out keep what they paid; the new
-- amounts apply to every round settled from now on.
-- Safe to run twice. The last row must say checks_passed = true.
-- =========================================================

-- BEFORE (reads only): what is live right now.
select
  round_participation_dp as everyone_before,
  round_first_dp as first_before,
  round_second_dp as second_before,
  round_third_dp as third_before
from public.league_economy_defaults;

begin;

update public.league_economy_defaults
set
  round_participation_dp = 150,
  round_first_dp = 200,
  round_second_dp = 150,
  round_third_dp = 100,
  updated_at = now();

update public.competition_round_reward_rules as r
set
  duel_points = v.duel_points,
  updated_at = now()
from (
  values
    ('participation', 150),
    ('round_winner', 200),
    ('round_runner_up', 150),
    ('round_third', 100)
) as v(role, duel_points),
public.competitions as c
where r.role = v.role
  and c.id = r.competition_id
  and c.status in ('draft', 'active');

commit;

-- =========================================================
-- VERIFICATION (reads only)
-- =========================================================

select
  d.round_participation_dp as everyone,
  d.round_first_dp as first,
  d.round_second_dp as second,
  d.round_third_dp as third,
  (
    select count(*)
    from public.competitions c
    where c.status in ('draft', 'active')
  ) as open_competitions,
  (
    d.round_participation_dp = 150
    and d.round_first_dp = 200
    and d.round_second_dp = 150
    and d.round_third_dp = 100
    and not exists (
      select 1
      from public.competition_round_reward_rules r
      join public.competitions c
        on c.id = r.competition_id
      where c.status in ('draft', 'active')
        and r.duel_points <> case r.role
          when 'participation' then 150
          when 'round_winner' then 200
          when 'round_runner_up' then 150
          when 'round_third' then 100
        end
    )
  ) as checks_passed
from public.league_economy_defaults d;
