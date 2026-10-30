-- Mini games hidden for the 2.0 launch (migration 202610301100):
--  * every mini_game_catalog row is inactive
--  * start_game_run refuses every game ('Unknown game.')
--  * players can no longer call settle_mini_game_period (no mini
--    game DP / vouchers can be paid); the service role still can
--  * the reward amounts themselves are kept

do $$
begin
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.mini_game_catalog where active),
    0,
    'no active mini game'
  );

  perform pg_temp.assert_true(
    (select count(*) from public.mini_game_catalog) > 0,
    'catalog rows are kept'
  );

  perform pg_temp.assert_true(
    (select count(*) from public.mini_game_reward_config) > 0,
    'reward amounts are kept'
  );

  perform pg_temp.assert_true(
    not has_function_privilege('authenticated', 'public.settle_mini_game_period(text, text)', 'execute'),
    'players cannot settle mini game periods'
  );

  perform pg_temp.act_as('bossg');

  begin
    perform * from public.start_game_run('pyramid_climb', 'practice', 3);
    raise exception 'FAILED: start_game_run accepted a hidden game';
  exception
    when others then
      if position('Unknown game.' in sqlerrm) = 0 then
        raise exception 'FAILED: wrong error from start_game_run: %', sqlerrm;
      end if;
      raise notice 'ok: hidden game cannot be started';
  end;
end;
$$;
