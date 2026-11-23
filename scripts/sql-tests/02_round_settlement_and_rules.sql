-- Fixes 2/3 (settlement half) + the crash found while testing:
--  * a full cycle (everyone plays everyone once) settles exactly
--    once: 300 DP + Premium for all, +400 + Normal / +300 / +200 for
--    1st / 2nd / 3rd (current live numbers), every DP move in the
--    ledger with a readable description. (Before 2.0 the last result
--    of a cycle crashed: "column reward_reason does not exist".)
--  * settlement never overwrites per-competition custom rules; it
--    only installs defaults when a competition has no rules at all.
--  * install_default_round_rewards_v2 is league-admin only, and the
--    settlement functions are not callable from the API.

select pg_temp.reset_players();

do $$
declare
  comp_id uuid;
  grants_now integer;
  ledger_now integer;
  voucher_count integer;
  desc_first text;
  rule_count integer;
begin
  -- ---------- A. defaults when there are no rules ----------
  comp_id := pg_temp.new_competition();

  select count(*) into rule_count from public.competition_round_reward_rules where competition_id = comp_id;
  perform pg_temp.assert_eq(rule_count, 0, 'a new competition starts without round rules');

  -- fardin 2 wins, bossg 1 win, samo 0 wins.
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg');
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');

  select count(*) into grants_now from public.competition_round_reward_grants where competition_id = comp_id;
  perform pg_temp.assert_eq(grants_now, 0, 'an incomplete cycle is not settled');

  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo');

  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'fardin', 'participation'), 300, 'participation 300 DP (fardin)');
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'samo', 'participation'), 300, 'participation 300 DP (samo)');
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'fardin', 'round_winner'), 400, '1st place +400 DP');
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'bossg', 'round_runner_up'), 300, '2nd place +300 DP');
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'samo', 'round_third'), 200, '3rd place +200 DP');

  -- match DP (100 win / 75 loss) + round DP
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 100 + 100 + 300 + 400, 'fardin balance = 2 wins + participation + 1st');
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 75 + 100 + 300 + 300, 'bossg balance = loss + win + participation + 2nd');
  perform pg_temp.assert_eq(pg_temp.balance('samo'), 75 + 75 + 300 + 200, 'samo balance = 2 losses + participation + 3rd');

  select count(*) into voucher_count
  from public.reward_vouchers v
  join public.competition_round_reward_grants g on g.id = v.round_reward_grant_id
  where g.competition_id = comp_id;
  perform pg_temp.assert_eq(voucher_count, 4, '3 Premium + 1 Normal vouchers, each linked to its grant');

  select description into desc_first
  from public.duel_point_transactions
  where profile_id = pg_temp.uid_of('fardin') and reason = 'round_winner_bonus'
  order by seq desc
  limit 1;
  perform pg_temp.assert_eq(desc_first, 'Round 1 complete — 1st place', 'round bonus ledger row has a readable description');

  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.competition_round_reward_grants g
      left join public.duel_point_transactions t on t.id = g.duel_point_transaction_id
      where g.competition_id = comp_id and (t.id is null or t.amount <> g.duel_points_granted)
    ),
    'every round grant points at its own ledger row with the same amount'
  );

  -- Settling again changes nothing.
  select count(*) into ledger_now from public.duel_point_transactions;
  perform pg_temp.assert_eq(public.settle_round_rewards_v2(comp_id, 3), 0, 're-settling a settled cycle creates 0 grants');
  perform pg_temp.assert_eq((select count(*) from public.duel_point_transactions)::integer, ledger_now, 're-settling writes no ledger rows');

  select count(*) into rule_count from public.competition_round_reward_rules where competition_id = comp_id;
  perform pg_temp.assert_eq(rule_count, 4, 'defaults were installed because the competition had no rules');
end;
$$;

select pg_temp.reset_players();

do $$
declare
  comp_id uuid;
begin
  -- ---------- B. custom rules survive settlement ----------
  comp_id := pg_temp.new_competition(2);

  perform pg_temp.act_as('bossg');
  perform public.install_default_round_rewards_v2(comp_id);

  update public.competition_round_reward_rules
  set duel_points = 123, voucher_type = null, voucher_quantity = 0
  where competition_id = comp_id and role = 'participation';

  update public.competition_round_reward_rules
  set duel_points = 999
  where competition_id = comp_id and role = 'round_winner';

  perform pg_temp.submit_winner(comp_id, 'samo', 'bossg');
  perform pg_temp.submit_winner(comp_id, 'samo', 'fardin');
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg');

  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'bossg', 'participation'), 123, 'custom participation rule (123) is used, not overwritten');
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'samo', 'round_winner'), 999, 'custom 1st-place rule (999) is used, not overwritten');
  perform pg_temp.assert_eq(
    (select duel_points from public.competition_round_reward_rules where competition_id = comp_id and role = 'participation'),
    123,
    'settlement left the custom rule row untouched'
  );
  perform pg_temp.assert_eq(
    (select count(*) from public.reward_vouchers v join public.competition_round_reward_grants g on g.id = v.round_reward_grant_id
     where g.competition_id = comp_id and v.voucher_type = 'premium_pack')::integer,
    0,
    'custom rule without voucher grants no Premium voucher'
  );

  -- Second cycle (schedule rounds 4-6) is round 2.
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 2);
  perform pg_temp.submit_winner(comp_id, 'bossg', 'fardin', 2);
  perform pg_temp.submit_winner(comp_id, 'samo', 'fardin', 2);
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 2, 'bossg', 'round_winner'), 999, 'second full cycle settles as round 2');

  -- ---------- C. admin guard on install_default_round_rewards_v2 ----------
  perform pg_temp.act_as('samo');
  begin
    perform public.install_default_round_rewards_v2(comp_id);
    raise exception 'FAILED: a non-admin could reset round rules';
  exception
    when raise_exception then
      if sqlerrm not like 'Only a league admin%' then
        raise;
      end if;
      raise notice 'ok: non-admin cannot call install_default_round_rewards_v2';
  end;

  -- An admin may explicitly reset to defaults.
  perform pg_temp.act_as('bossg');
  perform public.install_default_round_rewards_v2(comp_id);
  perform pg_temp.assert_eq(
    (select duel_points from public.competition_round_reward_rules where competition_id = comp_id and role = 'participation'),
    300,
    'admin reset restores the league default (300)'
  );
end;
$$;

-- ---------- D. API roles ----------
do $$
begin
  begin
    set local role anon;
    perform public.install_default_round_rewards_v2(gen_random_uuid());
    raise exception 'FAILED: anon could call install_default_round_rewards_v2';
  exception
    when insufficient_privilege then
      raise notice 'ok: anon cannot execute install_default_round_rewards_v2';
  end;

  begin
    set local role authenticated;
    perform public.settle_round_rewards_v2(gen_random_uuid(), 1);
    raise exception 'FAILED: authenticated could call settle_round_rewards_v2';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot execute settle_round_rewards_v2 directly';
  end;

  begin
    set local role authenticated;
    perform public._settle_round_cycle(gen_random_uuid(), 1, null);
    raise exception 'FAILED: authenticated could call _settle_round_cycle';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot execute _settle_round_cycle';
  end;
end;
$$;
