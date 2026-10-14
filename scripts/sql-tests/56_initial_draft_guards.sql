-- Initial Draft guards (202610152040, code-review M4 + browser test):
--  * start_personal_initial_draft needs the Boss Route (slot 1) first
--  * one-time: a second start is refused while ANY seat (waiting,
--    drafting, completed) in a non-cancelled draft exists
--  * a cancelled draft does not count
--  * the admin tool start_initial_draft refuses a player who already
--    had their Initial Draft

-- Start samo from scratch (rolled back): no drafts, no Boss Route.
delete from public.draft_picks where draft_player_id in (select id from public.draft_players where profile_id = pg_temp.uid_of('samo'));
delete from public.draft_offer_cards where offer_id in (
  select o.id from public.draft_offers o
  join public.draft_players dp on dp.id = o.draft_player_id
  where dp.profile_id = pg_temp.uid_of('samo')
);
delete from public.draft_offers where draft_player_id in (select id from public.draft_players where profile_id = pg_temp.uid_of('samo'));
delete from public.draft_players where profile_id = pg_temp.uid_of('samo');
delete from public.player_boss_paths where profile_id = pg_temp.uid_of('samo');

do $$
declare
  league uuid;
  first_draft uuid;
  raised text;
begin
  select league_id into league from public.league_members where profile_id = pg_temp.uid_of('samo');

  perform pg_temp.act_as('samo');

  raised := null;
  begin
    perform public.start_personal_initial_draft(league);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'Choose your Boss Route first.', 'no draft before the Boss Route');

  insert into public.player_boss_paths (profile_id, league_id, route_slot, route_id)
  values (pg_temp.uid_of('samo'), league, 1, (select id from public.boss_routes order by code limit 1));

  first_draft := public.start_personal_initial_draft(league);
  perform pg_temp.assert_true(first_draft is not null, 'with a Boss Route the draft starts');

  raised := null;
  begin
    perform public.start_personal_initial_draft(league);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'You already have an Initial Draft in progress.', 'a second draft is refused while one runs');

  -- A 'waiting' seat (e.g. from the admin tool) counts too.
  update public.draft_players set status = 'waiting' where draft_id = first_draft;
  raised := null;
  begin
    perform public.start_personal_initial_draft(league);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'You already have an Initial Draft in progress.', 'a waiting seat also blocks a second draft');

  update public.draft_players set status = 'completed', completed_at = now() where draft_id = first_draft;
  raised := null;
  begin
    perform public.start_personal_initial_draft(league);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'You have already completed your Initial Draft.', 'a completed draft can never be redone');

  -- The admin tool refuses samo as well.
  perform pg_temp.act_as('bossg');
  raised := null;
  begin
    perform public.start_initial_draft(league, 'Admin re-draft', array[pg_temp.uid_of('samo')]);
  exception when others then raised := sqlerrm;
  end;
  perform pg_temp.assert_eq(raised, 'A player in this draft already had their one-time Initial Draft.', 'the admin tool cannot give a second draft');

  -- A cancelled draft does not count: the player gets their one draft.
  update public.drafts set status = 'cancelled' where id = first_draft;
  perform pg_temp.act_as('samo');
  perform pg_temp.assert_true(
    public.start_personal_initial_draft(league) is not null,
    'after a cancelled draft the player can still do their one draft'
  );
end;
$$;
