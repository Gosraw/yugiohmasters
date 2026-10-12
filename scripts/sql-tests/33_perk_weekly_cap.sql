-- Weekly P2W perk cap (migration 202610121100):
--  * perk_config.weekly_dp_cap defaults to 600
--  * approve_achievement_claim refuses an approval that takes the
--    claimant over the cap (no DP paid, claim stays pending)
--  * only approvals in the current Europe/Amsterdam ISO week count
--  * the cap is per player and editable (null = no cap)

select pg_temp.reset_players();

-- Start every player from zero claims (rolled back).
delete from public.achievement_claims;

-- fardin requests a claim (as fardin), samo approves it (as samo).
create function pg_temp.claim(target_key text)
returns uuid
language plpgsql
as $$
declare
  claim_id uuid;
begin
  perform pg_temp.act_as('fardin');
  claim_id := public.request_achievement_claim(target_key);
  return claim_id;
end;
$$;

create function pg_temp.approve(target_claim uuid)
returns void
language plpgsql
as $$
begin
  perform pg_temp.act_as('samo');
  perform public.approve_achievement_claim(target_claim);
end;
$$;

do $$
declare
  c1 uuid;
  c2 uuid;
  c3 uuid;
  c4 uuid;
  refused boolean := false;
begin
  perform pg_temp.assert_eq(
    (select weekly_dp_cap from public.perk_config),
    600,
    'default weekly cap is 600 DP'
  );

  -- 300 + 250 = 550: both fit under 600.
  c1 := pg_temp.claim('fine_dining_summon');
  perform pg_temp.approve(c1);
  c2 := pg_temp.claim('delivery_from_another_dimension');
  perform pg_temp.approve(c2);

  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 550, 'fardin paid 550 DP');
  perform pg_temp.assert_eq(
    public.perk_dp_this_week(pg_temp.uid_of('fardin')),
    550,
    'perk_dp_this_week counts this week''s approvals'
  );

  -- +150 would be 700 > 600: refused, nothing paid, still pending.
  c3 := pg_temp.claim('snack_phase');

  begin
    perform pg_temp.approve(c3);
  exception
    when others then
      if sqlerrm not like 'Weekly perk cap reached: 550 / 600 DP this week%' then
        raise;
      end if;
      refused := true;
  end;

  perform pg_temp.assert_true(refused, 'approval over the cap is refused');
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 550, 'no DP paid for the refused claim');
  perform pg_temp.assert_eq(
    (select status from public.achievement_claims where id = c3),
    'pending',
    'refused claim stays pending'
  );

  -- Another player's cap is separate.
  perform pg_temp.act_as('samo');
  c4 := public.request_achievement_claim('fine_dining_summon');
  perform pg_temp.act_as('fardin');
  perform public.approve_achievement_claim(c4);
  perform pg_temp.assert_eq(pg_temp.balance('samo'), 300, 'samo has his own cap');

  -- Approvals from last week don't count: move fardin's two
  -- approvals 7 days back, then the pending 150 fits.
  update public.achievement_claims
  set decided_at = decided_at - interval '7 days'
  where id in (c1, c2);

  perform pg_temp.assert_eq(
    public.perk_dp_this_week(pg_temp.uid_of('fardin')),
    0,
    'last week''s approvals are not counted'
  );

  perform pg_temp.approve(c3);
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 700, 'pending claim approved once the week rolled over');

  -- Editable: a lower cap blocks, null removes the cap.
  update public.perk_config set weekly_dp_cap = 100;
  c1 := pg_temp.claim('home_cooked_advantage');
  refused := false;

  begin
    perform pg_temp.approve(c1);
  exception
    when others then
      if sqlerrm not like 'Weekly perk cap reached: 150 / 100 DP%' then
        raise;
      end if;
      refused := true;
  end;

  perform pg_temp.assert_true(refused, 'a lowered cap is enforced');

  update public.perk_config set weekly_dp_cap = null;
  perform pg_temp.approve(c1);
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 800, 'null cap = no cap');

  -- Idempotent approve is still a no-op (no double payout).
  perform pg_temp.approve(c1);
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 800, 'second approve pays nothing');
end;
$$;
