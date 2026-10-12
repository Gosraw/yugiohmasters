-- Shared helpers for scripts/sql-tests/*.sql. Created as pg_temp
-- functions inside the test transaction (run.mjs rolls everything
-- back), so they never touch the real schema.

create function pg_temp.uid_of(target_username text)
returns uuid
language sql
stable
as $$
  select id from public.profiles where username = target_username;
$$;

-- Act as a signed-in player for the rest of the transaction, the
-- same way PostgREST does (auth.uid() reads request.jwt.claims).
create function pg_temp.act_as(target_username text)
returns uuid
language plpgsql
as $$
declare
  user_id uuid := pg_temp.uid_of(target_username);
begin
  if user_id is null then
    raise exception 'test setup: no profile %', target_username;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text,
    true
  );

  return user_id;
end;
$$;

create function pg_temp.assert_eq(actual anyelement, expected anyelement, label text)
returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception 'FAILED: % (expected %, got %)', label, expected, actual;
  end if;

  raise notice 'ok: %', label;
end;
$$;

create function pg_temp.assert_true(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'FAILED: %', label;
  end if;

  raise notice 'ok: %', label;
end;
$$;

create function pg_temp.balance(target_username text)
returns integer
language sql
stable
as $$
  select duel_points from public.profiles where username = target_username;
$$;

-- Start from a known state: everyone at 0 DP, no vouchers. (Rolled
-- back with the rest of the test.)
create function pg_temp.reset_players()
returns void
language sql
as $$
  update public.profiles set duel_points = 0 where duel_points <> 0;
  delete from public.reward_vouchers;
$$;

-- 3-player single-duel SEASON competition (bossg is the league admin),
-- matches generated: schedule rounds 1-3 = round 1 (one full cycle),
-- 4-6 = round 2 when meetings = 2.
create function pg_temp.new_competition(target_meetings integer default 1)
returns uuid
language plpgsql
as $$
declare
  new_id uuid;
  league uuid;
begin
  perform pg_temp.act_as('bossg');

  select lm.league_id
  into league
  from public.league_members lm
  where lm.profile_id = pg_temp.uid_of('bossg');

  new_id := public.create_competition_v2(league, 'SQL test season', target_meetings, 'single_duel');

  -- It is THE season (competitions.is_season, 202610121500): any
  -- other open season in the local DB steps aside for the test.
  update public.competitions
  set is_season = false
  where league_id = league
    and id <> new_id
    and is_season
    and status in ('draft', 'active');

  perform public.mark_competition_as_season(new_id);

  perform public.add_competition_player_v2(new_id, pg_temp.uid_of(u))
  from unnest(array['bossg', 'samo', 'fardin']) as u;

  perform public.generate_round_robin_matches_v2(new_id);

  return new_id;
end;
$$;

-- The (first-cycle unless meeting given) match between two players.
create function pg_temp.match_between(target_competition_id uuid, a text, b text, target_meeting integer default 1)
returns uuid
language sql
stable
as $$
  select id
  from public.matches
  where competition_id = target_competition_id
    and tiebreak_id is null
    and meeting_number = target_meeting
    and pg_temp.uid_of(a) in (player_one_id, player_two_id)
    and pg_temp.uid_of(b) in (player_one_id, player_two_id);
$$;

-- Submit (as bossg, the admin) `winner` beating `loser` 1-0.
create function pg_temp.submit_winner(target_competition_id uuid, winner text, loser text, target_meeting integer default 1)
returns uuid
language plpgsql
as $$
declare
  m public.matches%rowtype;
begin
  select * into m from public.matches where id = pg_temp.match_between(target_competition_id, winner, loser, target_meeting);

  perform pg_temp.act_as('bossg');
  perform public.submit_competition_match_result_v2(
    m.id,
    case when m.player_one_id = pg_temp.uid_of(winner) then 1 else 0 end,
    case when m.player_two_id = pg_temp.uid_of(winner) then 1 else 0 end
  );

  return m.id;
end;
$$;

-- Admin correction: the match between winner and loser now goes to
-- `winner` 1-0.
create function pg_temp.correct_winner(target_competition_id uuid, winner text, loser text, reason text, target_meeting integer default 1)
returns uuid
language plpgsql
as $$
declare
  m public.matches%rowtype;
begin
  select * into m from public.matches where id = pg_temp.match_between(target_competition_id, winner, loser, target_meeting);

  perform pg_temp.act_as('bossg');
  perform public.correct_competition_match_result_v2(
    m.id,
    case when m.player_one_id = pg_temp.uid_of(winner) then 1 else 0 end,
    case when m.player_two_id = pg_temp.uid_of(winner) then 1 else 0 end,
    reason
  );

  return m.id;
end;
$$;

-- Active round grant DP for a player/role in a logical round.
create function pg_temp.active_grant(target_competition_id uuid, target_round integer, target_username text, target_role text)
returns integer
language sql
stable
as $$
  select duel_points_granted
  from public.competition_round_reward_grants
  where competition_id = target_competition_id
    and round_number = target_round
    and profile_id = pg_temp.uid_of(target_username)
    and reward_role = target_role
    and status = 'granted';
$$;
