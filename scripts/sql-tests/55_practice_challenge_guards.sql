-- Practice challenges vs season duels, unfunded wagers
-- (202610152030, code-review H1 / H2 / H3):
--  H1 a pending SEASON duel does not block a practice challenge
--  H2 decline / cancel / configure / fund / add-card refuse season duels
--  H3 accept_practice_challenge accepts + stakes atomically; a result
--     needs both stakes; a one-sided wager is refunded, never paid;
--     either player can cancel a stuck accepted wager duel

select pg_temp.reset_players();

-- Ready, active decks for everyone (setup only: triggers skipped).
set local session_replication_role = replica;

update public.decks set is_active = false where is_active;

insert into public.decks (league_id, owner_id, name, status, is_active)
select lm.league_id, lm.profile_id, 'SQL test deck', 'ready', true
from public.league_members lm
where lm.profile_id in (pg_temp.uid_of('bossg'), pg_temp.uid_of('samo'), pg_temp.uid_of('fardin'));

set local session_replication_role = origin;

do $$
declare
  comp_id uuid;
  season_duel uuid;
  league uuid;
  challenge uuid;
  raised text;
begin
  comp_id := pg_temp.new_competition(1);
  season_duel := pg_temp.match_between(comp_id, 'samo', 'fardin');

  select league_id into league from public.matches where id = season_duel;

  perform pg_temp.assert_eq(
    (select status::text from public.matches where id = season_duel), 'pending',
    'setup: an unplayed season duel is pending'
  );

  -- H1
  perform pg_temp.act_as('samo');
  challenge := public.create_match_challenge(league, pg_temp.uid_of('fardin'));
  perform pg_temp.assert_true(challenge is not null, 'H1: a pending season duel does not block a practice challenge');

  raised := null;
  begin
    perform public.create_match_challenge(league, pg_temp.uid_of('fardin'));
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_true(raised like 'There is already a pending challenge%', 'H1: a second practice challenge is still refused');

  -- H2: the season duel cannot be cancelled / declined / wagered.
  raised := null;
  begin
    perform public.cancel_match_challenge(season_duel);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'Season duels can''t be cancelled.', 'H2: cancel refuses a season duel');

  raised := null;
  begin
    perform public.configure_practice_challenge(season_duel, 'dp', 100);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'League duels never have a wager.', 'H2: configure refuses a season duel');

  raised := null;
  begin
    perform public.fund_match_dp_wager(season_duel);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'League duels never have a wager.', 'H2: fund refuses a season duel');

  raised := null;
  begin
    perform public.add_match_wager_card(season_duel, gen_random_uuid());
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'League duels never have a wager.', 'H2: add card refuses a season duel');

  perform pg_temp.act_as('fardin');
  raised := null;
  begin
    perform public.decline_match_challenge(season_duel);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'Season duels can''t be declined.', 'H2: decline refuses a season duel');

  perform pg_temp.assert_eq(
    (select status::text from public.matches where id = season_duel), 'pending',
    'H2: the season duel is untouched'
  );

  -- Practice challenges still work normally.
  perform public.decline_match_challenge(challenge);
  perform pg_temp.assert_eq(
    (select status::text from public.matches where id = challenge), 'declined',
    'a practice challenge can still be declined'
  );
end;
$$;

-- ---------- H3: atomic accept ----------
do $$
declare
  league uuid;
  challenge uuid;
  raised text;
begin
  select league_id into league from public.league_members where profile_id = pg_temp.uid_of('samo');

  update public.profiles set duel_points = 500 where id = pg_temp.uid_of('samo');
  update public.profiles set duel_points = 50 where id = pg_temp.uid_of('fardin');

  perform pg_temp.act_as('samo');
  challenge := public.create_match_challenge(league, pg_temp.uid_of('fardin'));
  perform public.configure_practice_challenge(challenge, 'dp', 100);
  perform public.fund_match_dp_wager(challenge);

  -- fardin has only 50 DP: the atomic accept fails as a whole.
  perform pg_temp.act_as('fardin');
  raised := null;
  begin
    perform public.accept_practice_challenge(challenge);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'Not enough Duel Points.', 'H3: accept fails when the stake cannot be paid');
  perform pg_temp.assert_eq(
    (select status::text from public.matches where id = challenge), 'pending',
    'H3: ...and the duel is NOT accepted (rolled back)'
  );
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 50, 'H3: ...and no DP left fardin');

  update public.profiles set duel_points = 500 where id = pg_temp.uid_of('fardin');
  perform public.accept_practice_challenge(challenge);
  perform pg_temp.assert_eq(
    (select status::text from public.matches where id = challenge), 'accepted',
    'H3: atomic accept with enough DP'
  );
  perform pg_temp.assert_eq(
    (select wager_status from public.matches where id = challenge), 'funded',
    'H3: both stakes are in'
  );
  perform pg_temp.assert_eq(pg_temp.balance('fardin'), 400, 'H3: fardin paid the stake once');
end;
$$;

-- ---------- H3: one-sided wager (the old two-call accept) ----------
do $$
declare
  league uuid;
  challenge uuid;
  raised text;
  samo_before integer;
begin
  select league_id into league from public.league_members where profile_id = pg_temp.uid_of('samo');

  perform pg_temp.act_as('samo');
  challenge := public.create_match_challenge(league, pg_temp.uid_of('bossg'));
  perform public.configure_practice_challenge(challenge, 'dp', 100);
  perform public.fund_match_dp_wager(challenge);
  samo_before := pg_temp.balance('samo');

  -- The live main app: accept, then fund in a second call that fails.
  perform pg_temp.act_as('bossg');
  update public.profiles set duel_points = 0 where id = pg_temp.uid_of('bossg');
  perform public.accept_match_challenge(challenge);

  raised := null;
  begin
    perform public.fund_match_dp_wager(challenge);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'Not enough Duel Points.', 'setup: bossg''s stake failed');

  raised := null;
  begin
    perform public.complete_match(challenge, 'player_two_win', null);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'Both wagers must be in before a result can be entered.', 'H3: no result on a one-sided wager');

  -- An old row that slipped through: completed with one stake.
  update public.matches
  set status = 'completed', result = 'player_two_win', winner_id = pg_temp.uid_of('bossg'), completed_at = now()
  where id = challenge;

  perform public.settle_match_wagers(challenge);
  perform pg_temp.assert_eq(pg_temp.balance('bossg'), 0, 'H3: the unfunded winner gets nothing');
  perform pg_temp.assert_eq(pg_temp.balance('samo'), samo_before + 100, 'H3: samo''s stake comes back');
  perform pg_temp.assert_eq(
    (select status from public.match_dp_escrows where match_id = challenge), 'refunded',
    'H3: the escrow is refunded, not won'
  );
end;
$$;

-- ---------- H3: either player can cancel a stuck accepted wager ----------
do $$
declare
  league uuid;
  challenge uuid;
  samo_before integer;
  raised text;
begin
  select league_id into league from public.league_members where profile_id = pg_temp.uid_of('samo');

  perform pg_temp.act_as('samo');
  challenge := public.create_match_challenge(league, pg_temp.uid_of('bossg'));
  perform public.configure_practice_challenge(challenge, 'dp', 50);
  perform public.fund_match_dp_wager(challenge);
  samo_before := pg_temp.balance('samo');

  perform pg_temp.act_as('bossg');
  perform public.accept_match_challenge(challenge);

  -- A third player cannot.
  perform pg_temp.act_as('fardin');
  raised := null;
  begin
    perform public.cancel_match_challenge(challenge);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'Only a player in this duel may cancel it', 'an outsider cannot cancel');

  -- The challenged player (not the challenger) can, because the
  -- stakes are not both in.
  perform pg_temp.act_as('bossg');
  perform public.cancel_match_challenge(challenge);
  perform public.release_match_wagers(challenge);

  perform pg_temp.assert_eq(
    (select status::text from public.matches where id = challenge), 'cancelled',
    'H3: a stuck accepted wager duel can be cancelled'
  );
  perform pg_temp.assert_eq(pg_temp.balance('samo'), samo_before + 50, 'H3: the one stake is refunded');
end;
$$;

-- A league admin who is not in the duel may settle it (resolved
-- someone else's dispute).
do $$
declare
  league uuid;
  practice_id uuid;
begin
  select league_id into league from public.league_members where profile_id = pg_temp.uid_of('samo');

  update public.profiles set duel_points = 0 where id in (pg_temp.uid_of('samo'), pg_temp.uid_of('fardin'));

  insert into public.matches (
    league_id, created_by, player_one_id, player_two_id,
    match_type, status, result, winner_id, completed_at,
    wager_type, wager_dp_amount, wager_status
  )
  values (
    league, pg_temp.uid_of('samo'), pg_temp.uid_of('samo'), pg_temp.uid_of('fardin'),
    'practice', 'completed', 'player_one_win', pg_temp.uid_of('samo'), now(),
    'dp', 30, 'funded'
  )
  returning id into practice_id;

  insert into public.match_dp_escrows (match_id, profile_id, amount, status)
  values
    (practice_id, pg_temp.uid_of('samo'), 30, 'funded'),
    (practice_id, pg_temp.uid_of('fardin'), 30, 'funded');

  perform pg_temp.act_as('bossg');
  perform public.settle_match_wagers(practice_id);

  perform pg_temp.assert_eq(pg_temp.balance('samo'), 60, 'an admin outside the duel can settle the wager');
end;
$$;
