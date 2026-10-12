-- Weekly goals (migration 202610120800 + refresh in 0810):
--  * one set per league + week, picked by seeded random, the same
--    on every call, one goal per configured category, Monday only
--  * progress recomputed from real events (competition duels,
--    packs opened, accepted trades); a completed goal pays its DP
--    once ("Weekly goal: ..."), all goals done pays the Premium
--    voucher once; +15 Season Path XP per completed goal
--  * last week's goals still pay when you first come back on Monday
--  * internal functions are not callable from the API

select pg_temp.reset_players();

-- Start every "this season" counter at zero: push the seeded demo
-- events 30 days back and drop derived season rows (rolled back).
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
$$;

select pg_temp.clean_season_slate();

do $$
declare
  league uuid;
  this_week date := public._amsterdam_week_start(now());
  set_a uuid;
  set_b uuid;
  first_pick text[];
  second_pick text[];
  item_count integer;
  item_categories text[];
begin
  select lm.league_id into league from public.league_members lm where lm.profile_id = pg_temp.uid_of('bossg');

  -- ---------- A. selection ----------
  set_a := public._ensure_weekly_goal_set(league, this_week);
  set_b := public._ensure_weekly_goal_set(league, this_week);
  perform pg_temp.assert_eq(set_a, set_b, 'a second call returns the same weekly set');

  select count(*), array_agg(category order by slot), array_agg(template_id order by slot)
  into item_count, item_categories, first_pick
  from public.weekly_goal_set_items where set_id = set_a;

  perform pg_temp.assert_eq(item_count, 3, 'three goals per week');
  perform pg_temp.assert_eq(item_categories, array['play', 'collect', 'trade'], 'one Play, one Collect, one Trade goal (slot order)');
  perform pg_temp.assert_eq(
    (select iso_week from public.weekly_goal_sets where id = set_a),
    to_char(this_week, 'IYYY-"W"IW'),
    'the set is labelled with its ISO week'
  );

  delete from public.weekly_goal_sets where id = set_a;
  set_a := public._ensure_weekly_goal_set(league, this_week);
  select array_agg(template_id order by slot) into second_pick from public.weekly_goal_set_items where set_id = set_a;
  perform pg_temp.assert_eq(second_pick, first_pick, 'seeded random: the same league + week always picks the same goals');

  begin
    perform public._ensure_weekly_goal_set(league, this_week + 1);
    raise exception 'FAILED: a set could start on a Tuesday';
  exception
    when raise_exception then
      if sqlerrm not like 'A weekly goal set must start on a Monday%' then
        raise;
      end if;
      raise notice 'ok: weekly sets only start on a Monday';
  end;

  -- Inactive templates are never picked; a category without any
  -- active template is simply skipped.
  update public.goal_templates set is_active = false where category = 'trade';
  delete from public.weekly_goal_sets where id = set_a;
  set_a := public._ensure_weekly_goal_set(league, this_week);
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.weekly_goal_set_items where set_id = set_a and category = 'trade'),
    0,
    'no active Trade template -> no Trade goal that week'
  );
  update public.goal_templates set is_active = true where category = 'trade';
end;
$$;

do $$
declare
  league uuid;
  this_week date := public._amsterdam_week_start(now());
  boss uuid := pg_temp.uid_of('bossg');
  comp_id uuid;
  goal_rows integer;
  goal_sum integer;
  ledger_before integer;
  desc_play text;
  voucher_count integer;
  overview jsonb;
begin
  select lm.league_id into league from public.league_members lm where lm.profile_id = boss;

  -- ---------- B. progress + payouts with controlled goals ----------
  update public.goal_templates set is_active = false;
  insert into public.goal_templates (id, category, goal_type, target, title)
  values
    ('t_play', 'play', 'competition_matches_played', 2, 'Test: play 2 season duels'),
    ('t_collect', 'collect', 'packs_opened', 1, 'Test: open a pack'),
    ('t_trade', 'trade', 'trades_completed', 1, 'Test: complete a trade');
  delete from public.weekly_goal_sets;

  perform public._refresh_season_progress(boss);

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.weekly_goal_progress where profile_id = boss),
    3,
    'a progress row per goal after the first refresh'
  );
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.duel_point_transactions where profile_id = boss and reason = 'weekly_goal'),
    0,
    'nothing paid before any goal is done'
  );

  -- Two competition duels for bossg (one win, one loss).
  comp_id := pg_temp.new_competition();
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg');

  perform public._refresh_season_progress(boss);

  select count(*), coalesce(sum(amount), 0), max(description)
  into goal_rows, goal_sum, desc_play
  from public.duel_point_transactions
  where profile_id = boss and reason = 'weekly_goal';

  perform pg_temp.assert_eq(goal_rows, 1, 'play goal paid once');
  perform pg_temp.assert_eq(goal_sum, 150, 'play goal pays 150 DP (weekly_goal_config.goal_dp)');
  perform pg_temp.assert_eq(desc_play, 'Weekly goal: Test: play 2 season duels', 'ledger row says which weekly goal');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.duel_point_transactions where profile_id = pg_temp.uid_of('samo') and reason = 'weekly_goal'),
    0,
    'another player is not paid by my refresh'
  );

  -- Idempotent.
  select count(*) into ledger_before from public.duel_point_transactions;
  perform public._refresh_season_progress(boss);
  perform pg_temp.assert_eq((select count(*)::integer from public.duel_point_transactions), ledger_before, 'refreshing again pays nothing new');

  -- Collect + trade.
  insert into public.shop_pack_openings (profile_id, pack_code) values (boss, 'normal');
  insert into public.trades (league_id, created_by, sender_id, receiver_id, status, completed_at)
  values (league, boss, boss, pg_temp.uid_of('samo'), 'accepted', now());

  perform public._refresh_season_progress(boss);

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.duel_point_transactions where profile_id = boss and reason = 'weekly_goal'),
    3,
    'all three goals paid'
  );

  select count(*) into voucher_count
  from public.reward_vouchers
  where profile_id = boss and source_type = 'weekly_goals' and voucher_type = 'premium_pack';
  perform pg_temp.assert_eq(voucher_count, 1, 'all three done -> one Premium voucher');
  perform pg_temp.assert_eq(
    (select note from public.reward_vouchers where profile_id = boss and source_type = 'weekly_goals'),
    'Weekly goals: all 3 done',
    'the voucher note explains it (shown by the reward pop-up)'
  );

  perform public._refresh_season_progress(boss);
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.reward_vouchers where profile_id = boss and source_type = 'weekly_goals'),
    1,
    'the bonus voucher is never paid twice'
  );

  -- Season Path XP for the goals (15 each by default).
  perform pg_temp.assert_eq(
    (select coalesce(sum(xp), 0)::integer from public.season_path_xp_events
     where profile_id = boss and source = 'weekly_goal_completed'),
    45,
    'each completed weekly goal gives 15 Season Path XP'
  );

  -- The player-facing overview reflects it.
  perform pg_temp.act_as('bossg');
  overview := public.get_my_season_overview();
  perform pg_temp.assert_eq(jsonb_array_length(overview -> 'weekly' -> 'items'), 3, 'overview lists 3 goals');
  perform pg_temp.assert_eq((overview -> 'weekly' -> 'bonus' ->> 'granted')::boolean, true, 'overview shows the bonus as granted');
  perform pg_temp.assert_eq((overview -> 'season' ->> 'week')::integer, public._season_week_number(public._current_season(), now()), 'overview carries the season week');
end;
$$;

-- ---------- C. last week's goals still pay on Monday ----------
do $$
declare
  league uuid;
  this_week date := public._amsterdam_week_start(now());
  samo uuid := pg_temp.uid_of('samo');
  last_set uuid;
begin
  select lm.league_id into league from public.league_members lm where lm.profile_id = samo;

  update public.seasons set starts_on = this_week - 14 where is_current;

  last_set := public._ensure_weekly_goal_set(league, this_week - 7);

  -- samo opened a pack last Wednesday (the t_collect goal of that week).
  insert into public.shop_pack_openings (profile_id, pack_code, opened_at)
  values (samo, 'premium', public._amsterdam_day_start(this_week - 5) + interval '20 hours');

  perform public._refresh_season_progress(samo);

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.weekly_goal_progress p
      join public.weekly_goal_set_items i on i.id = p.set_item_id
      where i.set_id = last_set and p.profile_id = samo and i.goal_type = 'packs_opened' and p.completed_at is not null
    ),
    'a goal finished last week is completed on the first refresh this week'
  );
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.duel_point_transactions where profile_id = samo and reason = 'weekly_goal'
       and metadata ->> 'weekly_goal_set_id' = last_set::text),
    1,
    'and its DP is paid'
  );
end;
$$;

-- ---------- D. API roles ----------
do $$
begin
  begin
    set local role authenticated;
    perform public._refresh_season_progress(gen_random_uuid());
    raise exception 'FAILED: authenticated could call _refresh_season_progress';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot execute _refresh_season_progress';
  end;

  begin
    set local role authenticated;
    perform public._refresh_weekly_goal_set(gen_random_uuid(), gen_random_uuid());
    raise exception 'FAILED: authenticated could call _refresh_weekly_goal_set';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot execute _refresh_weekly_goal_set';
  end;

  begin
    set local role anon;
    perform public.get_my_season_overview();
    raise exception 'FAILED: anon could call get_my_season_overview';
  exception
    when insufficient_privilege then
      raise notice 'ok: anon cannot execute get_my_season_overview';
  end;
end;
$$;

-- ---------- E. the initial draft is not "collecting" ----------
do $$
declare
  boss uuid := pg_temp.uid_of('bossg');
  league uuid;
  copy_id uuid;
  week_from timestamptz := public._amsterdam_day_start(public._amsterdam_week_start(now()));
  before_count integer;
begin
  select lm.league_id into league from public.league_members lm where lm.profile_id = boss;
  select id into copy_id from public.card_instances where current_owner_id = boss limit 1;

  before_count := public._weekly_goal_progress_count('cards_collected', '{}', boss, league, week_from, week_from + interval '7 days');

  insert into public.ownership_history (card_instance_id, league_id, from_owner_id, to_owner_id, event_type)
  values
    (copy_id, league, null, boss, 'acquired:draft'),
    (copy_id, league, null, boss, 'acquired:shop'),
    (copy_id, league, pg_temp.uid_of('samo'), boss, 'ownership_transfer');

  perform pg_temp.assert_eq(
    public._weekly_goal_progress_count('cards_collected', '{}', boss, league, week_from, week_from + interval '7 days') - before_count,
    1,
    'cards_collected counts a pack/shop copy, not the initial draft or a trade'
  );
end;
$$;
