-- Season Path (migration 202610120810):
--  * XP from real events, configurable per source: 10 per
--    competition duel played, +5 per win, 10 per completed round
--    (+15 per weekly goal, covered in 20_weekly_goals.sql)
--  * reaching a tier auto-grants its reward once: DP via the ledger
--    ("Season Path: tier N reward"), vouchers with a note, the
--    final tier's title in profile_titles
--  * a corrected duel loses its win XP, granted tiers stay
--  * disabled sources give no XP

select pg_temp.reset_players();

create function pg_temp.clean_season_slate()
returns void
language sql
as $$
  update public.matches set completed_at = completed_at - interval '30 days'
  where completed_at is not null;
  update public.competition_round_reward_grants set granted_at = granted_at - interval '30 days';
  update public.ownership_history set created_at = created_at - interval '30 days';
  update public.shop_pack_openings set opened_at = opened_at - interval '30 days';
  update public.trades set completed_at = coalesce(completed_at, updated_at) - interval '30 days',
    updated_at = updated_at - interval '30 days';
  delete from public.weekly_goal_sets;
  delete from public.season_path_xp_events;
  delete from public.season_path_tier_grants;
  delete from public.profile_titles;
  -- Earlier real page loads may already have paid weekly goals /
  -- tiers on this dev database; count only what this test pays.
  delete from public.duel_point_transactions
  where reason in ('weekly_goal', 'season_path_reward');
  -- No weekly goals in this file: their XP would blur the numbers.
  update public.goal_templates set is_active = false;
$$;

select pg_temp.clean_season_slate();

create function pg_temp.path_xp(target_username text)
returns integer
language sql
stable
as $$
  select coalesce(sum(xp), 0)::integer
  from public.season_path_xp_events
  where profile_id = pg_temp.uid_of(target_username)
    and season_number = (public._current_season()).season_number;
$$;

create function pg_temp.tiers_granted(target_username text)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.season_path_tier_grants
  where profile_id = pg_temp.uid_of(target_username)
    and season_number = (public._current_season()).season_number;
$$;

do $$
declare
  season_no integer := (public._current_season()).season_number;
  boss uuid := pg_temp.uid_of('bossg');
  comp_id uuid;
  path_dp integer;
  path_rows integer;
  ledger_before integer;
  voucher_before integer;
  overview jsonb;
begin
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.season_path_tiers where season_number = season_no),
    20,
    'the current season has 20 Season Path tiers'
  );
  perform pg_temp.assert_eq(
    (select sum(xp_required)::integer from public.season_path_tiers where season_number = season_no),
    1700,
    'proposal: 20 x 85 XP = 1,700 XP'
  );

  -- Small tiers so a few duels reach them (rolled back).
  update public.season_path_tiers set xp_required = 10 where season_number = season_no;

  -- bossg beats samo and fardin, samo beats fardin: round 1 settles.
  comp_id := pg_temp.new_competition();
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');
  perform pg_temp.submit_winner(comp_id, 'bossg', 'fardin');
  perform pg_temp.submit_winner(comp_id, 'samo', 'fardin');

  perform public._refresh_season_progress(boss);
  perform public._refresh_season_progress(pg_temp.uid_of('samo'));

  -- bossg: 2 played (20) + 2 wins (10) + round 1 (10) = 40 XP.
  perform pg_temp.assert_eq(pg_temp.path_xp('bossg'), 40, 'bossg XP = 2 duels + 2 wins + 1 round');
  perform pg_temp.assert_eq(pg_temp.path_xp('samo'), 35, 'samo XP = 2 duels + 1 win + 1 round');
  perform pg_temp.assert_eq(pg_temp.tiers_granted('bossg'), 4, '40 XP at 10 XP per tier = tiers 1-4');
  perform pg_temp.assert_eq(pg_temp.tiers_granted('samo'), 3, '35 XP = tiers 1-3');

  -- Tier 1 = 100 DP, 2 = Normal, 3 = 150 DP, 4 = Normal.
  select count(*), coalesce(sum(amount), 0)
  into path_rows, path_dp
  from public.duel_point_transactions
  where profile_id = boss and reason = 'season_path_reward';

  perform pg_temp.assert_eq(path_rows, 2, 'two DP tiers reached');
  perform pg_temp.assert_eq(path_dp, 250, 'tier 1 (100) + tier 3 (150) DP');
  perform pg_temp.assert_true(
    exists (select 1 from public.duel_point_transactions
            where profile_id = boss and reason = 'season_path_reward' and description = 'Season Path: tier 3 reward'),
    'ledger description names the tier'
  );
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.reward_vouchers
     where profile_id = boss and source_type = 'season_path' and voucher_type = 'normal_pack'),
    2,
    'tiers 2 and 4 each give a Normal voucher'
  );
  perform pg_temp.assert_true(
    (select bool_and(g.duel_point_transaction_id is not null or g.dp_granted = 0)
       and bool_and(g.voucher_id is not null or g.voucher_quantity = 0)
     from public.season_path_tier_grants g where g.profile_id = boss),
    'every tier grant links to its ledger row / voucher'
  );

  -- Idempotent.
  select count(*) into ledger_before from public.duel_point_transactions;
  select count(*) into voucher_before from public.reward_vouchers;
  perform public._refresh_season_progress(boss);
  perform public._refresh_season_progress(boss);
  perform pg_temp.assert_eq((select count(*)::integer from public.duel_point_transactions), ledger_before, 'refreshing again writes no ledger rows');
  perform pg_temp.assert_eq((select count(*)::integer from public.reward_vouchers), voucher_before, 'refreshing again creates no vouchers');
  perform pg_temp.assert_eq(pg_temp.path_xp('bossg'), 40, 'XP is not counted twice');

  -- ---------- correction: the win XP goes, tiers stay ----------
  perform pg_temp.correct_winner(comp_id, 'samo', 'bossg', 'SQL test: wrong winner tapped');
  perform public._refresh_season_progress(boss);
  perform pg_temp.assert_eq(pg_temp.path_xp('bossg'), 35, 'a corrected duel loses its +5 win XP');
  perform pg_temp.assert_eq(pg_temp.tiers_granted('bossg'), 4, 'tiers already reached stay granted');

  -- ---------- final tier: title ----------
  update public.season_path_tiers set xp_required = 1 where season_number = season_no;
  perform public._refresh_season_progress(boss);

  perform pg_temp.assert_eq(pg_temp.tiers_granted('bossg'), 20, 'all 20 tiers granted');
  perform pg_temp.assert_true(
    exists (select 1 from public.profile_titles where profile_id = boss and title = 'Pharaoh''s Ascendant' and source = 'season_path'),
    'the final tier stores the season title on the profile'
  );
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.reward_vouchers where profile_id = boss and source_type = 'season_path' and voucher_type = 'deluxe_pack'),
    1,
    'the final tier gives a Deluxe voucher'
  );
  perform pg_temp.assert_eq(
    (select coalesce(sum(amount), 0)::integer from public.duel_point_transactions where profile_id = boss and reason = 'season_path_reward'),
    3900,
    'the whole track pays 3,900 DP (proposal total)'
  );

  -- Overview for the signed-in player.
  perform pg_temp.act_as('bossg');
  overview := public.get_my_season_overview();
  perform pg_temp.assert_eq((overview -> 'path' ->> 'xp')::integer, 35, 'overview XP');
  perform pg_temp.assert_eq(jsonb_array_length(overview -> 'path' -> 'tiers'), 20, 'overview lists the 20 tiers');
  perform pg_temp.assert_eq(
    (select count(*)::integer from jsonb_array_elements(overview -> 'path' -> 'tiers') t where (t ->> 'granted')::boolean),
    20,
    'overview marks every tier as claimed'
  );
  perform pg_temp.assert_true((overview -> 'titles') ? 'Pharaoh''s Ascendant', 'overview lists the title');
end;
$$;

-- ---------- disabled source ----------
do $$
declare
  comp_id uuid;
  before_xp integer;
begin
  perform public._refresh_season_progress(pg_temp.uid_of('fardin'));
  update public.season_path_xp_sources set is_enabled = false where source = 'competition_match_played';

  before_xp := pg_temp.path_xp('fardin');
  comp_id := pg_temp.new_competition();
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo');
  perform public._refresh_season_progress(pg_temp.uid_of('fardin'));

  perform pg_temp.assert_eq(pg_temp.path_xp('fardin') - before_xp, 5, 'a disabled source gives no XP (only the +5 win)');
end;
$$;
