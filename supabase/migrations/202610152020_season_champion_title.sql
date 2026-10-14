begin;

-- =========================================================
-- Season champion title (2026-10-15)
--
-- Owner decision C (QA fix round): the winner of a season
-- competition gets a permanent title "Season N Champion" in
-- public.profile_titles (source 'season_champion'). They can equip
-- it on /profile like any earned title; /profile and /league show a
-- champion badge.
--
-- WHERE: the final #1 is certain once the competition is
-- 'completed' (finalize_competition_v2 writes competition_results
-- from the tiebreak-aware final standings - tiebreaks must be
-- resolved first - and then flips the status). A trigger on that
-- status change grants the title, so the manual Finalize button and
-- the automatic finalize after the last duel both count, and no
-- finalize body had to be copied.
--
-- A later result correction can still change the final placements
-- (correct_competition_match_result_v2 updates competition_results
-- of a completed competition). A second trigger re-syncs then: the
-- new #1 gets the title, the old #1 loses THIS title (and has it
-- unequipped if it was their custom_title).
--
-- Idempotent: profile_titles is unique (profile_id, title) and the
-- sync only inserts the missing row. A shared first place (not
-- possible after a resolved tiebreak, but defensive) grants nothing.
--
-- N = the season the competition started in (seasons.starts_on <=
-- start date), else the current season. Nothing is back-filled.
-- Backwards compatible with the live main app (two triggers and a
-- helper; nothing existing changes).
-- =========================================================

create or replace function public._sync_season_champion_title(target_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  competition_row public.competitions%rowtype;
  champion_id uuid;
  champion_count integer;
  season_no integer;
  title_text text;
begin
  select * into competition_row from public.competitions where id = target_competition_id;

  if not found
     or competition_row.is_season is not true
     or competition_row.status <> 'completed' then
    return;
  end if;

  select count(*), min(profile_id::text)::uuid
  into champion_count, champion_id
  from public.competition_results
  where competition_id = target_competition_id
    and placement = 1;

  if champion_count <> 1 then
    return;
  end if;

  select s.season_number
  into season_no
  from public.seasons s
  where s.starts_on <= (
    coalesce(competition_row.starts_at, competition_row.created_at) at time zone 'Europe/Amsterdam'
  )::date
  order by s.starts_on desc
  limit 1;

  if season_no is null then
    season_no := (public._current_season()).season_number;
  end if;

  if season_no is null then
    return;
  end if;

  title_text := 'Season ' || season_no || ' Champion';

  -- A correction moved #1: the old champion loses this title.
  update public.profiles p
  set
    custom_title = null,
    updated_at = now()
  where p.custom_title = title_text
    and p.id <> champion_id
    and exists (
      select 1
      from public.profile_titles pt
      where pt.profile_id = p.id
        and pt.title = title_text
        and pt.source = 'season_champion'
    );

  delete from public.profile_titles
  where title = title_text
    and source = 'season_champion'
    and profile_id <> champion_id;

  insert into public.profile_titles (profile_id, title, season_number, source)
  values (champion_id, title_text, season_no, 'season_champion')
  on conflict (profile_id, title) do nothing;
end;
$$;

revoke all on function public._sync_season_champion_title(uuid) from public, anon, authenticated;

create or replace function public._season_champion_after_competition_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._sync_season_champion_title(new.id);
  return null;
end;
$$;

revoke all on function public._season_champion_after_competition_update() from public, anon, authenticated;

drop trigger if exists competitions_season_champion_title on public.competitions;

create trigger competitions_season_champion_title
  after update of status on public.competitions
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public._season_champion_after_competition_update();

create or replace function public._season_champion_after_result_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._sync_season_champion_title(new.competition_id);
  return null;
end;
$$;

revoke all on function public._season_champion_after_result_change() from public, anon, authenticated;

drop trigger if exists competition_results_season_champion_title on public.competition_results;

create trigger competition_results_season_champion_title
  after insert or update of placement on public.competition_results
  for each row
  execute function public._season_champion_after_result_change();

commit;
