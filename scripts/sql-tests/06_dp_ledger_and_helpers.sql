-- Fixes 4 + 8: one way in, one way out, and every row explained.
--  * no database function adds DP to profiles.duel_points except
--    _credit_duel_points (static check over every function body)
--  * _credit_duel_points / _debit_duel_points are not callable from
--    the API; debit is all-or-nothing unless partial is asked for
--  * every ledger row has a description (column is NOT NULL, a
--    trigger fills one when a writer forgets)
--  * profiles.duel_points is canonical; wallets mirrors it

select pg_temp.reset_players();

do $$
declare
  offenders text;
  tx_id uuid;
  debit record;
  raw_description text;
begin
  -- Static: any function body that does `duel_points = duel_points +`
  -- (or `duel_points + <x>` on an UPDATE) other than the helper.
  select string_agg(p.proname, ', ' order by p.proname)
  into offenders
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname <> '_credit_duel_points'
    and p.prosrc ~* 'duel_points\s*=\s*(\w+\.)?duel_points\s*\+';

  perform pg_temp.assert_eq(coalesce(offenders, ''), '', 'no function credits profiles.duel_points directly (only _credit_duel_points)');

  -- Credit returns its ledger row; description stored.
  tx_id := public._credit_duel_points(pg_temp.uid_of('samo'), 500, 'test_credit', null, null, '{}'::jsonb, 'Test credit');
  perform pg_temp.assert_eq(
    (select description from public.duel_point_transactions where id = tx_id),
    'Test credit',
    '_credit_duel_points returns the ledger row id and stores the description'
  );

  -- All-or-nothing debit.
  begin
    perform public._debit_duel_points(pg_temp.uid_of('samo'), 501, 'test_debit');
    raise exception 'FAILED: debit beyond balance accepted';
  exception
    when raise_exception then
      if sqlerrm <> 'Not enough Duel Points.' then
        raise;
      end if;
      raise notice 'ok: a normal debit beyond the balance is refused';
  end;

  -- Partial debit never goes below 0 and records the shortfall.
  select * into debit
  from public._debit_duel_points(pg_temp.uid_of('samo'), 800, 'test_reversal', null, null, '{}'::jsonb, 'Test reversal', true);
  perform pg_temp.assert_eq(debit.debited, 500, 'partial debit takes what is there');
  perform pg_temp.assert_eq(debit.unrecovered, 300, 'partial debit reports the shortfall');
  perform pg_temp.assert_eq(pg_temp.balance('samo'), 0, 'balance stops at 0');
  perform pg_temp.assert_eq(
    (select (metadata ->> 'unrecovered')::integer from public.duel_point_transactions where id = debit.transaction_id),
    300,
    'shortfall stored on the ledger row'
  );

  -- Wallets mirror the canonical balance.
  perform public._credit_duel_points(pg_temp.uid_of('fardin'), 777, 'test_credit');
  perform pg_temp.assert_eq(
    (select duel_points from public.wallets where profile_id = pg_temp.uid_of('fardin'))::integer,
    pg_temp.balance('fardin'),
    'wallets.duel_points mirrors profiles.duel_points'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1 from public.profiles p join public.wallets w on w.profile_id = p.id
      where w.duel_points <> p.duel_points
    ),
    'no wallet row disagrees with its profile'
  );

  -- A writer that forgets the description still gets one.
  insert into public.duel_point_transactions (profile_id, amount, balance_after, reason, metadata)
  values (pg_temp.uid_of('fardin'), 0, pg_temp.balance('fardin'), 'round_runner_up_bonus', '{"logical_round_number": 7}')
  returning description into raw_description;
  perform pg_temp.assert_eq(raw_description, 'Round 7 complete — 2nd place', 'trigger fills a description from reason + metadata');

  insert into public.duel_point_transactions (profile_id, amount, balance_after, reason)
  values (pg_temp.uid_of('fardin'), 0, pg_temp.balance('fardin'), 'some_future_reason')
  returning description into raw_description;
  perform pg_temp.assert_eq(raw_description, 'Some Future Reason', 'unknown reasons still get readable text');

  perform pg_temp.assert_true(
    (select attnotnull from pg_attribute
     where attrelid = 'public.duel_point_transactions'::regclass and attname = 'description'),
    'duel_point_transactions.description is NOT NULL'
  );
end;
$$;

do $$
begin
  begin
    set local role authenticated;
    perform public._credit_duel_points(gen_random_uuid(), 1, 'x');
    raise exception 'FAILED: authenticated could call _credit_duel_points';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot execute _credit_duel_points';
  end;

  begin
    set local role anon;
    perform public._credit_duel_points(gen_random_uuid(), 1, 'x');
    raise exception 'FAILED: anon could call _credit_duel_points';
  exception
    when insufficient_privilege then
      raise notice 'ok: anon cannot execute _credit_duel_points';
  end;

  begin
    set local role authenticated;
    perform public._debit_duel_points(gen_random_uuid(), 1, 'x');
    raise exception 'FAILED: authenticated could call _debit_duel_points';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot execute _debit_duel_points';
  end;
end;
$$;
