-- 2026-10-12 small leftovers (migration 202610121700):
-- 1. Trade drafts (incl. counter drafts) are only readable by their
--    creator; once sent, both players see them.
-- 2. save_trade_draft_message keeps the message on a draft.
-- 3. start_season_competition is all-or-nothing.
-- 4. Reversed bounty wording.

create function pg_temp.expect_error(statement text, expected_fragment text, label text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception
    when others then
      if position(expected_fragment in sqlerrm) = 0 then
        raise exception 'FAILED: % (wrong error: %)', label, sqlerrm;
      end if;
      raise notice 'ok: %', label;
      return;
  end;
  raise exception 'FAILED: % (no error raised)', label;
end;
$$;

do $$
declare
  league uuid := (select league_id from public.league_members where profile_id = pg_temp.uid_of('samo'));
  samo uuid := pg_temp.uid_of('samo');
  fardin uuid := pg_temp.uid_of('fardin');
  t1 uuid;
  t_counter uuid;
  visible integer;
  comp_before integer;
  comp_after integer;
begin
  -- samo builds a draft (DP only, so no cards are needed).
  perform pg_temp.act_as('samo');
  t1 := public.create_trade(league, fardin);
  perform public.set_trade_dp(t1, 0, 0);

  perform public.save_trade_draft_message(t1, '  hello there  ');
  perform pg_temp.assert_eq(
    (select message from public.trades where id = t1),
    'hello there',
    'save_trade_draft_message stores the trimmed message'
  );

  -- fardin cannot read samo's draft...
  perform pg_temp.act_as('fardin');
  execute 'set local role authenticated';
  select count(*) into visible from public.trades where id = t1;
  execute 'reset role';
  perform pg_temp.assert_eq(visible, 0, 'receiver cannot read an unsent draft');

  perform pg_temp.expect_error(
    format('select public.save_trade_draft_message(%L, %L)', t1, 'hijack'),
    'Only the sender',
    'only the sender can save a draft message'
  );

  -- ...but samo can.
  perform pg_temp.act_as('samo');
  execute 'set local role authenticated';
  select count(*) into visible from public.trades where id = t1;
  execute 'reset role';
  perform pg_temp.assert_eq(visible, 1, 'creator can read own draft');

  -- Once it is pending, fardin sees it and can counter it. The
  -- counter draft is then fardin's alone.
  update public.trades set status = 'pending', submitted_at = now() where id = t1;

  perform pg_temp.act_as('fardin');
  execute 'set local role authenticated';
  select count(*) into visible from public.trades where id = t1;
  execute 'reset role';
  perform pg_temp.assert_eq(visible, 1, 'receiver reads a sent trade');

  t_counter := public.counter_trade(t1);

  perform pg_temp.act_as('samo');
  execute 'set local role authenticated';
  select count(*) into visible from public.trades where id = t_counter;
  execute 'reset role';
  perform pg_temp.assert_eq(visible, 0, 'original sender cannot open the unsent counter draft');

  perform pg_temp.act_as('fardin');
  execute 'set local role authenticated';
  select count(*) into visible from public.trades where id = t_counter;
  execute 'reset role';
  perform pg_temp.assert_eq(visible, 1, 'counter creator reads own counter draft');

  -- start_season_competition: a non-admin fails and leaves nothing.
  select count(*) into comp_before from public.competitions where league_id = league;
  perform pg_temp.act_as('fardin');
  perform pg_temp.expect_error(
    format('select public.start_season_competition(%L, %L, 3)', league, 'Test Season'),
    'admin',
    'non-admin cannot start a season'
  );
  select count(*) into comp_after from public.competitions where league_id = league;
  perform pg_temp.assert_eq(comp_after, comp_before, 'failed season start leaves no competition behind');
end;
$$;

-- Admin path: when the season flag step refuses (a season is already
-- open), the freshly created competition is rolled back too.
do $$
declare
  league uuid := (select league_id from public.league_members where profile_id = pg_temp.uid_of('bossg'));
  first_id uuid;
  comp_before integer;
  comp_after integer;
begin
  perform pg_temp.act_as('bossg');

  update public.competitions set status = 'cancelled' where league_id = league and is_season and status in ('draft', 'active');

  first_id := public.start_season_competition(league, 'Season A', 2);
  perform pg_temp.assert_true(
    (select is_season from public.competitions where id = first_id),
    'start_season_competition flags the season'
  );
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.competition_players where competition_id = first_id),
    (select count(*)::integer from public.league_members where league_id = league),
    'every league member is entered'
  );

  select count(*) into comp_before from public.competitions where league_id = league;
  perform pg_temp.expect_error(
    format('select public.start_season_competition(%L, %L, 2)', league, 'Season B'),
    'already running',
    'second season start is refused'
  );
  select count(*) into comp_after from public.competitions where league_id = league;
  perform pg_temp.assert_eq(comp_after, comp_before, 'refused season start leaves no orphan draft');
end;
$$;

do $$
begin
  perform pg_temp.assert_true(
    position('Bounty reversed after a result correction' in pg_get_functiondef('public._season_bonus_reverse(uuid,text)'::regprocedure)) > 0,
    'reversed bounty uses the clear wording'
  );
end;
$$;
