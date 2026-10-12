begin;

-- =========================================================
-- DUELIST CIRCLE 2.0 - SHADOW ARENA (auto battler)
--
-- Reuses everything from 202610120700_mini_games.sql: the
-- game_runs table (game = 'auto_battler'), submit_game_run /
-- reject_game_run / get_my_game_run, the leaderboards and the
-- shared mini_game_reward_config + settle_mini_game_period
-- rewards (leaderboard placement only).
--
-- The only change: start_game_run() now also accepts
-- 'auto_battler'. Same signature, and for 'pyramid_climb' the
-- behaviour is byte-for-byte what 202610120700 shipped (seed
-- format, messages). For the arena:
--   - daily: one attempt per Europe/Amsterdam day, spent the
--     moment you start; everyone gets the same server-made seed
--     (generated on the first start of the day, so nobody can
--     know it in advance);
--   - practice: a fresh random server seed every run, counts for
--     the weekly board.
--
-- The browser plays src/lib/games/autobattler/engine.ts and sends
-- its action log; src/app/actions/autobattler.ts replays it with
-- the same engine and only submits the REPLAYED score.
--
-- Additive / backwards compatible: nothing the live main app uses
-- is touched.
-- =========================================================

create or replace function public.start_game_run(
  target_game text,
  target_mode text,
  target_engine_version integer
)
returns table (
  run_id uuid,
  run_seed text,
  run_mode text,
  run_day date,
  run_iso_week text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_league uuid;
  today date := public._mini_game_today();
  new_seed text;
  new_id uuid;
  used_message text;
  seed_prefix text;
begin
  if caller is null then
    raise exception 'Not authenticated.';
  end if;

  if target_game is null or target_game not in ('pyramid_climb', 'auto_battler') then
    raise exception 'Unknown game.';
  end if;

  if target_mode not in ('daily', 'practice') then
    raise exception 'Unknown mode.';
  end if;

  if target_engine_version is null or target_engine_version < 1 then
    raise exception 'Unknown game version.';
  end if;

  used_message := case target_game
    when 'auto_battler' then 'You already played today''s Daily Arena. A new one opens at midnight.'
    else 'You already used today''s Daily Climb. A new one opens at midnight.'
  end;

  seed_prefix := case target_game
    when 'auto_battler' then 'arena-'
    else ''
  end;

  caller_league := public._mini_game_league_for(caller);

  if caller_league is null then
    raise exception 'Join a league first.';
  end if;

  if target_mode = 'daily' then
    if exists (
      select 1
      from public.game_runs r
      where r.game = target_game
        and r.profile_id = caller
        and r.day = today
        and r.mode = 'daily'
    ) then
      raise exception '%', used_message;
    end if;

    insert into public.mini_game_daily_seeds (
      game,
      day,
      seed
    )
    values (
      target_game,
      today,
      seed_prefix || 'daily:' || today::text || ':' || substr(md5(gen_random_uuid()::text), 1, 12)
    )
    on conflict (game, day) do nothing;

    select s.seed
    into new_seed
    from public.mini_game_daily_seeds s
    where s.game = target_game
      and s.day = today;
  else
    new_seed := seed_prefix || 'practice:' || substr(md5(gen_random_uuid()::text), 1, 16);
  end if;

  begin
    insert into public.game_runs (
      league_id,
      profile_id,
      game,
      mode,
      seed,
      day,
      iso_week,
      engine_version
    )
    values (
      caller_league,
      caller,
      target_game,
      target_mode,
      new_seed,
      today,
      public._mini_game_iso_week(today),
      target_engine_version
    )
    returning id
    into new_id;
  exception
    when unique_violation then
      raise exception '%', used_message;
  end;

  return query
  select
    new_id,
    new_seed,
    target_mode,
    today,
    public._mini_game_iso_week(today);
end;
$$;

revoke all on function public.start_game_run(text, text, integer) from public, anon;

grant execute on function public.start_game_run(text, text, integer) to authenticated;

commit;
