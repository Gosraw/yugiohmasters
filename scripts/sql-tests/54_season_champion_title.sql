-- Season champion title (202610152020, owner decision C):
--  * finalizing a season competition gives the #1 a permanent
--    "Season N Champion" profile title (source 'season_champion')
--  * running the sync again changes nothing (idempotent)
--  * a correction after finalize that changes #1 moves the title
--    (and unequips it from the old champion)
--  * a competition that is not the season gives no title

select pg_temp.reset_players();

delete from public.profile_titles where source = 'season_champion';

do $$
declare
  comp_id uuid;
  season_no integer := (public._current_season()).season_number;
  title_text text;
begin
  title_text := 'Season ' || season_no || ' Champion';

  comp_id := pg_temp.new_competition(1);

  -- bossg 2 wins, samo 1, fardin 0. The referee duel goes last so the
  -- auto-finalize runs as the admin.
  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');
  perform pg_temp.submit_winner(comp_id, 'bossg', 'fardin');

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.profile_titles where source = 'season_champion'), 0,
    'no title before the season is complete'
  );

  perform pg_temp.submit_winner(comp_id, 'samo', 'fardin');

  perform pg_temp.assert_eq(
    (select status from public.competitions where id = comp_id), 'completed',
    'the season auto-finalized'
  );

  perform pg_temp.assert_true(
    exists (
      select 1 from public.profile_titles
      where profile_id = pg_temp.uid_of('bossg')
        and title = title_text
        and season_number = season_no
        and source = 'season_champion'
    ),
    'the champion got "' || title_text || '"'
  );

  perform pg_temp.assert_eq(
    (select count(*)::integer from public.profile_titles where source = 'season_champion'), 1,
    'only the champion gets it'
  );

  -- Idempotent.
  perform public._sync_season_champion_title(comp_id);
  perform public._sync_season_champion_title(comp_id);
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.profile_titles where source = 'season_champion'), 1,
    'syncing again adds nothing'
  );

  -- bossg equips it; then a correction makes samo #1
  -- (samo beat bossg: bossg 1 win, samo 2, fardin 0).
  update public.profiles set custom_title = title_text where id = pg_temp.uid_of('bossg');

  perform pg_temp.correct_winner(comp_id, 'samo', 'bossg', 'SQL test: samo won that duel');

  perform pg_temp.assert_eq(
    (select placement from public.competition_results where competition_id = comp_id and profile_id = pg_temp.uid_of('samo')),
    1,
    'after the correction samo is #1'
  );
  perform pg_temp.assert_true(
    exists (
      select 1 from public.profile_titles
      where profile_id = pg_temp.uid_of('samo') and title = title_text
    ),
    'the title moved to the new champion'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1 from public.profile_titles
      where profile_id = pg_temp.uid_of('bossg') and title = title_text
    ),
    'the old champion lost it'
  );
  perform pg_temp.assert_eq(
    (select custom_title from public.profiles where id = pg_temp.uid_of('bossg')),
    null::text,
    'and it was unequipped'
  );
end;
$$;

-- A non-season competition gives no title.
select pg_temp.reset_players();

delete from public.profile_titles where source = 'season_champion';

do $$
declare
  comp_id uuid;
begin
  comp_id := pg_temp.new_competition(1);
  update public.competitions set is_season = false where id = comp_id;

  perform pg_temp.submit_winner(comp_id, 'bossg', 'samo');
  perform pg_temp.submit_winner(comp_id, 'bossg', 'fardin');
  perform pg_temp.submit_winner(comp_id, 'samo', 'fardin');

  perform pg_temp.assert_eq(
    (select status from public.competitions where id = comp_id), 'completed',
    'the event finalized'
  );
  perform pg_temp.assert_eq(
    (select count(*)::integer from public.profile_titles where source = 'season_champion'), 0,
    'a competition that is not the season gives no champion title'
  );
end;
$$;
