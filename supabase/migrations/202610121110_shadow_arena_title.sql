-- =========================================================
-- 2.0: the auto battler's display name is "Shadow Arena"
--
-- _mini_game_title() (202610120700_mini_games.sql) names a game in
-- mini game reward descriptions / ledger notes ("Shadow Arena —
-- Daily winner ..."). The game key stays 'auto_battler'; only the
-- label changes. Same signature, same grants (create or replace
-- keeps the revoke from 202610120700). Already-written ledger rows
-- keep their old text.
-- =========================================================

begin;

create or replace function public._mini_game_title(target_game text)
returns text
language sql
immutable
set search_path = public
as $$
  select case target_game
    when 'pyramid_climb' then 'Pyramid Climb'
    when 'auto_battler' then 'Shadow Arena'
    else initcap(replace(target_game, '_', ' '))
  end;
$$;

revoke all on function public._mini_game_title(text) from public, anon, authenticated;

commit;
