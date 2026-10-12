-- =========================================================
-- PROPOSAL - NOT APPLIED - WAITING FOR THE OWNER'S APPROVAL
--
-- Season 2 economy numbers proposed by the season simulator
-- (docs/season-sim-report.md, scripts/season-sim/config.mjs PROPOSED).
-- This file is deliberately NOT in supabase/migrations/, so no deploy
-- or local replay ever runs it. The live/seeded values today are:
--   Boss stage prices 900 / 1,400 / 2,400
--   Boss route slots  7,000 (slot 2) / 10,000 (slot 3)
--   Round rewards     300 DP + Premium (everyone),
--                     +400 DP + Normal (#1), +300 (#2), +200 (#3)
--
-- Only numbers that already live in config tables are here. The new
-- systems in the proposal (weekly goals, Season Path, bounty,
-- catch-up, mini games, perk cap) do not exist in the database yet.
--
-- To apply after approval (one transaction, all or nothing):
--   set duelist.approve_season2_numbers = 'yes';
--   \i supabase/proposals/season2_numbers.sql
-- or turn it into a dated migration.
-- =========================================================

begin;

do $guard$
begin
  if coalesce(current_setting('duelist.approve_season2_numbers', true), '') <> 'yes' then
    raise exception 'season2_numbers.sql is a PROPOSAL. Set duelist.approve_season2_numbers = yes only after the owner approved these numbers.';
  end if;
end;
$guard$;

-- Boss evolution: 1,800 / 3,200 / 5,500 (full route 10,500).
update public.boss_route_stages
set dp_cost_to_reach = case stage_number
  when 2 then 1800
  when 3 then 3200
  when 4 then 5500
end
where stage_number in (2, 3, 4);

-- Boss route slots: 3,000 (slot 2) / 5,500 (slot 3).
-- Round placement: #1 +350 DP + Normal, #2 +200, #3 +100.
-- Participation (300 DP + Premium) and match DP (100 / 75) unchanged.
update public.league_economy_defaults
set
  boss_route_slot_2_unlock_dp = 3000,
  boss_route_slot_3_unlock_dp = 5500,
  round_first_dp = 350,
  round_second_dp = 200,
  round_third_dp = 100,
  updated_at = now()
where id = true;

-- Running competitions keep the round rules they were settled with
-- (settlement never overwrites per-competition rules). Bring the
-- placement rules of every not-yet-finished competition in line with
-- the new defaults; rounds already paid out are not touched.
update public.competition_round_reward_rules r
set
  duel_points = case r.role
    when 'round_winner' then 350
    when 'round_runner_up' then 200
    when 'round_third' then 100
    else r.duel_points
  end,
  updated_at = now()
from public.competitions c
where c.id = r.competition_id
  and c.status in ('draft', 'active')
  and r.role in ('round_winner', 'round_runner_up', 'round_third');

commit;
