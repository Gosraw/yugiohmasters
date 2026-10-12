-- Bounty + catch-up (migration 202610120820), an add-on to round
-- settlement / match submission:
--  * beating the SOLE season leader (most wins before the duel)
--    pays +75 DP to the winner; nothing while the lead is tied
--  * a settled round pays +50 DP to the SOLE last place who is at
--    least 3 wins behind the leader
--  * an admin correction reverses a bonus that is no longer deserved
--    (status 'reversed' + negative ledger row) and grants the new
--    one; re-running never pays twice

select pg_temp.reset_players();

create function pg_temp.bonus_count(target_competition_id uuid, target_kind text, target_status text default 'granted')
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.season_bonus_grants
  where competition_id = target_competition_id
    and kind = target_kind
    and status = target_status;
$$;

create function pg_temp.bonus_holder(target_competition_id uuid, target_kind text, target_round integer default null)
returns text
language sql
stable
as $$
  select p.username
  from public.season_bonus_grants g
  join public.profiles p on p.id = g.profile_id
  where g.competition_id = target_competition_id
    and g.kind = target_kind
    and g.status = 'granted'
    and (target_round is null or g.round_number = target_round);
$$;

-- ---------- A. bounty ----------
do $$
declare
  comp_id uuid;
  m2 uuid;
  samo_before integer;
  bounty_desc text;
  ledger_before integer;
begin
  comp_id := pg_temp.new_competition(2);

  -- Nobody leads yet: no bounty.
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg');
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'bounty'), 0, 'no bounty when nobody leads (0-0-0)');

  -- fardin is the sole leader (1 win); samo beats him -> bounty.
  samo_before := pg_temp.balance('samo');
  m2 := pg_temp.submit_winner(comp_id, 'samo', 'fardin');
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'bounty'), 1, 'beating the sole leader pays a bounty');
  perform pg_temp.assert_eq(pg_temp.bonus_holder(comp_id, 'bounty'), 'samo', 'the winner gets the bounty');
  perform pg_temp.assert_eq(pg_temp.balance('samo') - samo_before, 100 + 75, 'samo: 100 DP duel win + 75 DP bounty');

  select description into bounty_desc
  from public.duel_point_transactions
  where profile_id = pg_temp.uid_of('samo') and reason = 'season_bounty';
  perform pg_temp.assert_true(bounty_desc like 'Bounty: beat season leader %', 'bounty ledger row has a readable description');

  -- Tied lead (fardin 1, samo 1): no bounty.
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'bounty'), 1, 'no bounty while the lead is tied');

  -- Round 1 is 1-1-1: no catch-up.
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'catch_up'), 0, 'no catch-up for an even round');

  -- Idempotent: syncing again changes nothing.
  select count(*) into ledger_before from public.duel_point_transactions;
  perform public._sync_match_bounty(m2, null);
  perform public.settle_round_rewards_v2(comp_id, 3);
  perform pg_temp.assert_eq((select count(*)::integer from public.duel_point_transactions), ledger_before, 're-syncing writes no ledger rows');

  -- Correction: fardin actually beat samo -> the bounty is taken back.
  perform pg_temp.correct_winner(comp_id, 'fardin', 'samo', 'SQL test: wrong winner tapped');
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'bounty'), 0, 'correction: no active bounty any more');
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'bounty', 'reversed'), 1, 'the old bounty is kept as reversed (history)');
  perform pg_temp.assert_eq(
    (select amount from public.duel_point_transactions where profile_id = pg_temp.uid_of('samo') and reason = 'season_bounty_reversal'),
    -75,
    'a -75 DP reversal row in samo''s ledger'
  );

  -- Corrected back: samo won after all -> bounty again (new grant).
  perform pg_temp.correct_winner(comp_id, 'samo', 'fardin', 'SQL test: it was samo after all');
  perform pg_temp.assert_eq(pg_temp.bonus_holder(comp_id, 'bounty'), 'samo', 'corrected back: samo holds the bounty again');
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.season_bonus_grants where competition_id = comp_id and kind = 'bounty'),
    2,
    'one reversed + one active bounty row'
  );
end;
$$;

select pg_temp.reset_players();

-- ---------- B. catch-up ----------
do $$
declare
  comp_id uuid;
  samo_before integer;
begin
  comp_id := pg_temp.new_competition(2);

  -- Round 1: fardin 2, bossg 1, samo 0 -> gap 2 (< 3): no catch-up.
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg');
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo');
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'catch_up'), 0, 'gap of 2 wins: no catch-up');
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'bounty'), 0, 'beating someone who is not the leader pays no bounty');

  -- Round 2 the same: fardin 4, bossg 2, samo 0 -> samo gets +50.
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg', 2);
  perform pg_temp.submit_winner(comp_id, 'fardin', 'samo', 2);
  samo_before := pg_temp.balance('samo');
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo', 2);

  perform pg_temp.assert_eq(pg_temp.bonus_holder(comp_id, 'catch_up', 2), 'samo', 'sole last place, 4 wins behind: catch-up');
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'catch_up'), 1, 'exactly one catch-up (round 2 only)');
  perform pg_temp.assert_eq(
    pg_temp.balance('samo') - samo_before,
    75 + 300 + 200 + 50,
    'samo: loss 75 + participation 300 + 3rd place 200 + catch-up 50'
  );
  perform pg_temp.assert_eq(
    (select description from public.duel_point_transactions where profile_id = pg_temp.uid_of('samo') and reason = 'season_catch_up'),
    'Catch-up bonus — Round 2',
    'catch-up ledger row has a readable description'
  );

  -- Settling again pays nothing new.
  perform public.settle_round_rewards_v2(comp_id, 6);
  perform public._sync_round_catch_up(comp_id, 2, null);
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.duel_point_transactions where reason = 'season_catch_up'),
    1,
    'catch-up is paid once'
  );

  -- Correction in round 2: samo beat bossg -> bossg 1, samo 1 tie for
  -- last -> catch-up reversed.
  perform pg_temp.correct_winner(comp_id, 'samo', 'bossg', 'SQL test: samo won', 2);
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'catch_up'), 0, 'tied last place after a correction: catch-up taken back');
  perform pg_temp.assert_eq(
    (select amount from public.duel_point_transactions where profile_id = pg_temp.uid_of('samo') and reason = 'season_catch_up_reversal'),
    -50,
    'a -50 DP reversal row'
  );

  -- And back again.
  perform pg_temp.correct_winner(comp_id, 'bossg', 'samo', 'SQL test: bossg won after all', 2);
  perform pg_temp.assert_eq(pg_temp.bonus_holder(comp_id, 'catch_up', 2), 'samo', 'corrected back: catch-up granted again');
end;
$$;

-- ---------- C. config switches + non-season events ----------
do $$
declare
  comp_id uuid;
begin
  update public.season_bonus_config set bounty_enabled = false;

  comp_id := pg_temp.new_competition();
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg');
  perform pg_temp.submit_winner(comp_id, 'samo', 'fardin');
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'bounty'), 0, 'bounty switched off in season_bonus_config: nothing paid');

  update public.season_bonus_config set bounty_enabled = true, bounty_dp = 120;
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');
  perform pg_temp.assert_eq(pg_temp.bonus_count(comp_id, 'bounty'), 0, 'tied lead still pays nothing');

  -- Amount comes from config.
  comp_id := pg_temp.new_competition();
  perform pg_temp.submit_winner(comp_id, 'fardin', 'bossg');
  perform pg_temp.submit_winner(comp_id, 'samo', 'fardin');
  perform pg_temp.assert_eq(
    (select duel_points_granted from public.season_bonus_grants where competition_id = comp_id and kind = 'bounty' and status = 'granted'),
    120,
    'bounty amount is read from season_bonus_config'
  );
end;
$$;

-- ---------- D. API roles ----------
do $$
begin
  begin
    set local role authenticated;
    perform public._sync_match_bounty(gen_random_uuid(), null);
    raise exception 'FAILED: authenticated could call _sync_match_bounty';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot execute _sync_match_bounty';
  end;

  begin
    set local role authenticated;
    perform public._sync_round_catch_up(gen_random_uuid(), 1, null);
    raise exception 'FAILED: authenticated could call _sync_round_catch_up';
  exception
    when insufficient_privilege then
      raise notice 'ok: authenticated cannot execute _sync_round_catch_up';
  end;
end;
$$;
