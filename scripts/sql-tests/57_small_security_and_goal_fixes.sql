-- Small code-review fixes (202610152050 + 202610152010 section 3):
--  * consume_reward_voucher: not callable by anon / signed-in players
--  * _phase*_verify_introspect: service role only
--  * tiebreak duels do not count for the season-duel weekly goals
--  * a season duel that completes after a dispute no longer keeps
--    disputed_by / dispute_reason

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.consume_reward_voucher(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.consume_reward_voucher(uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.consume_reward_voucher(uuid, uuid)', 'execute'),
  'consume_reward_voucher: service role only'
);

select pg_temp.assert_true(
  not has_function_privilege('anon', p.oid, 'execute')
  and not has_function_privilege('authenticated', p.oid, 'execute'),
  p.proname || ': not callable by players'
)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like '\_phase%\_verify\_introspect';

select pg_temp.reset_players();

do $$
declare
  comp_id uuid;
  league uuid;
  tb_id uuid;
  played_before integer;
  won_before integer;
  m public.matches%rowtype;
  d uuid;
begin
  comp_id := pg_temp.new_competition(1);
  select league_id into league from public.competitions where id = comp_id;

  played_before := public._weekly_goal_progress_count(
    'competition_matches_played', '{}'::jsonb, pg_temp.uid_of('samo'), league,
    now() - interval '1 day', now() + interval '1 day'
  );

  perform pg_temp.submit_winner(comp_id, 'samo', 'fardin');

  perform pg_temp.assert_eq(
    public._weekly_goal_progress_count(
      'competition_matches_played', '{}'::jsonb, pg_temp.uid_of('samo'), league,
      now() - interval '1 day', now() + interval '1 day'
    ),
    played_before + 1,
    'the season duel counts for "play season duels"'
  );

  played_before := public._weekly_goal_progress_count(
    'competition_matches_played', '{}'::jsonb, pg_temp.uid_of('samo'), league,
    now() - interval '1 day', now() + interval '1 day'
  );
  won_before := public._weekly_goal_progress_count(
    'competition_matches_won', '{}'::jsonb, pg_temp.uid_of('samo'), league,
    now() - interval '1 day', now() + interval '1 day'
  );

  insert into public.competition_tiebreaks (competition_id, tied_profile_ids, tie_size, status)
  values (comp_id, array[pg_temp.uid_of('samo'), pg_temp.uid_of('fardin')], 2, 'in_progress')
  returning id into tb_id;

  insert into public.matches (
    league_id, created_by, player_one_id, player_two_id, match_type, status,
    competition_id, match_format, tiebreak_id, result, winner_id, completed_at,
    player_one_duel_wins, player_two_duel_wins
  )
  values (
    league, pg_temp.uid_of('bossg'), pg_temp.uid_of('samo'), pg_temp.uid_of('fardin'), 'practice', 'completed',
    comp_id, 'single_duel', tb_id, 'player_one_win', pg_temp.uid_of('samo'), now(),
    1, 0
  );

  perform pg_temp.assert_eq(
    public._weekly_goal_progress_count(
      'competition_matches_played', '{}'::jsonb, pg_temp.uid_of('samo'), league,
      now() - interval '1 day', now() + interval '1 day'
    ),
    played_before,
    'a tiebreak duel does not count as a season duel played'
  );
  perform pg_temp.assert_eq(
    public._weekly_goal_progress_count(
      'competition_matches_won', '{}'::jsonb, pg_temp.uid_of('samo'), league,
      now() - interval '1 day', now() + interval '1 day'
    ),
    won_before,
    'a tiebreak win does not count as a season duel won'
  );

  -- Dispute fields are cleared when the duel completes.
  d := pg_temp.match_between(comp_id, 'bossg', 'samo');
  select * into m from public.matches where id = d;

  perform pg_temp.act_as('samo');
  perform public.submit_competition_match_result_v2(
    d,
    case when m.player_one_id = pg_temp.uid_of('samo') then 1 else 0 end,
    case when m.player_two_id = pg_temp.uid_of('samo') then 1 else 0 end
  );
  perform pg_temp.act_as('bossg');
  perform public.dispute_competition_match_result(d, 'I won');
  perform pg_temp.assert_eq(
    (select status::text from public.matches where id = d), 'disputed',
    'setup: disputed'
  );

  -- They agree after all: bossg sends samo's result, samo confirms.
  perform public.submit_competition_match_result_v2(
    d,
    case when m.player_one_id = pg_temp.uid_of('samo') then 1 else 0 end,
    case when m.player_two_id = pg_temp.uid_of('samo') then 1 else 0 end
  );
  perform pg_temp.act_as('samo');
  perform public.confirm_competition_match_result(d);

  select * into m from public.matches where id = d;
  perform pg_temp.assert_eq(m.status::text, 'completed', 'the duel completed');
  perform pg_temp.assert_eq(m.disputed_by, null::uuid, 'disputed_by is cleared');
  perform pg_temp.assert_eq(m.dispute_reason, null::text, 'dispute_reason is cleared');
end;
$$;
