-- Fix 2: an admin correction re-settles the full-cycle round grants.
--  * grants that no longer match the corrected standings are marked
--    'reversed' (kept as history) with a negative
--    'round_reward_reversal' ledger row; the new grants are paid.
--  * vouchers created by a reversed grant are taken back.
--  * running it again (or correcting to the same result) is a no-op.
--  * a reversal never drives a balance below 0; the shortfall and
--    already-spent vouchers are recorded as unrecovered.
--  * match DP is corrected by delta (win 100 / loss 75).

select pg_temp.reset_players();

do $$
declare
  comp_id uuid;
  ledger_before integer;
  grants_before integer;
  reversed_row public.competition_round_reward_grants%rowtype;
  reversal_tx public.duel_point_transactions%rowtype;
begin
  comp_id := pg_temp.new_competition(2);

  -- Cycle 1: fardin 2 wins (1st), bossg 1 (2nd), samo 0 (3rd).
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg');
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo');

  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'fardin', 'round_winner'), 400, 'before: fardin is 1st');

  -- Admin: bossg actually beat fardin. Now bossg 2 wins (1st),
  -- fardin 1 (2nd), samo 0 (3rd).
  perform pg_temp.correct_winner(comp_id, 'bossg', 'fardin', 'Wrong winner tapped');

  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'bossg', 'round_winner'), 400, 'after: bossg holds the 1st-place grant');
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'fardin', 'round_runner_up'), 300, 'after: fardin holds the 2nd-place grant');
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'samo', 'round_third'), 200, 'after: samo still 3rd (untouched)');
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'fardin', 'round_winner'), null::integer, 'fardin no longer holds an active 1st-place grant');

  select * into reversed_row
  from public.competition_round_reward_grants
  where competition_id = comp_id and round_number = 1
    and profile_id = pg_temp.uid_of('fardin') and reward_role = 'round_winner';

  perform pg_temp.assert_eq(reversed_row.status, 'reversed', 'old 1st-place grant kept as history with status reversed');
  perform pg_temp.assert_eq(reversed_row.reversal_reason, 'Wrong winner tapped', 'reversal stores the admin reason');
  perform pg_temp.assert_eq(reversed_row.duel_points_recovered, 400, 'all 400 DP recovered');
  perform pg_temp.assert_eq(reversed_row.voucher_quantity_recovered, 1, 'its Normal voucher was taken back');

  select * into reversal_tx from public.duel_point_transactions where id = reversed_row.reversal_duel_point_transaction_id;
  perform pg_temp.assert_eq(reversal_tx.amount, -400, 'reversal ledger row is -400');
  perform pg_temp.assert_eq(reversal_tx.reason, 'round_reward_reversal', 'reversal ledger reason');
  perform pg_temp.assert_eq(
    reversal_tx.description,
    'Round 1 corrected — 1st place reward taken back',
    'reversal ledger row has a readable description'
  );

  perform pg_temp.assert_eq(
    (select count(*) from public.reward_vouchers v join public.competition_round_reward_grants g on g.id = v.round_reward_grant_id
     where g.competition_id = comp_id and v.profile_id = pg_temp.uid_of('bossg') and v.voucher_type = 'normal_pack')::integer,
    1,
    'bossg received the Normal voucher of the new 1st-place grant'
  );

  -- Exact balances: match DP (corrected) + round DP.
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 100 + 100 + 300 + 400, 'bossg = 2 wins + participation + 1st');
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 75 + 100 + 300 + 300, 'fardin = loss + win + participation + 2nd');
  perform pg_temp.assert_eq(pg_temp.balance('samo'), 75 + 75 + 300 + 200, 'samo unchanged');

  perform pg_temp.assert_eq(
    (select count(*) from public.competition_round_reward_grants where competition_id = comp_id)::integer,
    3 + 3 + 2,
    'history kept: 6 original grants + 2 new, none deleted'
  );

  -- Idempotent: same correction again + explicit re-settle change nothing.
  select count(*) into ledger_before from public.duel_point_transactions;
  select count(*) into grants_before from public.competition_round_reward_grants;

  perform pg_temp.correct_winner(comp_id, 'bossg', 'fardin', 'Wrong winner tapped');
  perform public._settle_round_cycle(comp_id, 2, 'again');

  perform pg_temp.assert_eq((select count(*) from public.duel_point_transactions)::integer, ledger_before, 'repeat correction writes no ledger rows');
  perform pg_temp.assert_eq((select count(*) from public.competition_round_reward_grants)::integer, grants_before, 'repeat correction creates no grants');
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 900, 'repeat correction leaves balances alone');

  -- Correct it back: the original standings return, each step logged.
  perform pg_temp.correct_winner(comp_id, 'fardin', 'bossg', 'Oops, original was right');
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'fardin', 'round_winner'), 400, 'correcting back: fardin is 1st again');
  perform pg_temp.assert_eq(pg_temp.active_grant(comp_id, 1, 'bossg', 'round_runner_up'), 300, 'correcting back: bossg is 2nd again');
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 100 + 100 + 300 + 400, 'correcting back restores fardin exactly');
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 75 + 100 + 300 + 300, 'correcting back restores bossg exactly');

  perform pg_temp.assert_true(
    not exists (select 1 from public.duel_point_transactions where description is null or length(trim(description)) = 0),
    'every ledger row has a description'
  );
end;
$$;

select pg_temp.reset_players();

do $$
declare
  comp_id uuid;
  reversed_row public.competition_round_reward_grants%rowtype;
begin
  -- Partial recovery: fardin spent almost everything and used the
  -- Normal voucher before the correction.
  comp_id := pg_temp.new_competition();

  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg');
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo');

  -- (test setup only) spend: balance down to 50, voucher consumed.
  update public.profiles set duel_points = 50 where id = pg_temp.uid_of('fardin');
  perform public.consume_reward_voucher(v.id, v.profile_id)
  from public.reward_vouchers v
  join public.competition_round_reward_grants g on g.id = v.round_reward_grant_id
  where g.competition_id = comp_id and g.profile_id = pg_temp.uid_of('fardin') and g.reward_role = 'round_winner';

  perform pg_temp.correct_winner(comp_id, 'bossg', 'fardin', 'Wrong winner tapped');

  select * into reversed_row
  from public.competition_round_reward_grants
  where competition_id = comp_id and round_number = 1
    and profile_id = pg_temp.uid_of('fardin') and reward_role = 'round_winner';

  -- fardin: 50 - 25 (match 100 -> 75) + 300 (2nd place, paid first) = 325,
  -- then the 400 reversal can take at most 325.
  perform pg_temp.assert_eq(reversed_row.duel_points_recovered, 325, 'reversal takes what is there (325)');
  perform pg_temp.assert_eq(reversed_row.duel_points_unrecovered, 75, 'the 75 DP shortfall is recorded, not hidden');
  perform pg_temp.assert_eq(reversed_row.voucher_quantity_unrecovered, 1, 'an already-spent voucher is recorded as unrecovered');
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 0, 'a balance never goes below 0');
end;
$$;
