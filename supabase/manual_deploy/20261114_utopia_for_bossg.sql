-- =========================================================
-- PASTE INTO THE SUPABASE SQL EDITOR (production), 2026-11-14
--
-- 1. The Utopia Boss Path goes live (same as
--    supabase/migrations/202611141200_utopia_route_for_bossg.sql).
-- 2. bossg switches from Legendary Ocean to Utopia. He keeps every
--    card, his decks and his DP. Only the 4 cards of his Legendary Ocean
--    path go (The Legendary Fisherman II, A Legendary Ocean, Atlantean
--    Heavy Infantry, Mother Grizzly); he gets Utopia Stage 1.
--
-- It refuses to run if one of those 4 Ocean cards is in a deck, trade
-- or wager, or if bossg is not on Legendary Ocean. Then nothing changes.
--
-- Run it once. The last result row must say checks_passed = true.
-- =========================================================

begin;

do $routes$
declare
  v_route uuid;
  v_missing text;
begin
  -- Every card name must resolve to exactly one catalog row.
  select string_agg(v.card_name, ', ')
  into v_missing
  from (
    values
    ('Halfway to Forever'),
    ('Number 39: Utopia'),
    ('Number 39: Utopia Beyond'),
    ('Number C39: Utopia Ray V'),
    ('Number S39: Utopia the Lightning'),
    ('Rank-Up-Magic Astral Force'),
    ('Rank-Up-Magic Limited Barian''s Force'),
    ('Reverse Breaker'),
    ('Rising Sun Slash'),
    ('Utopia Buster'),
    ('ZS - Armed Sage'),
    ('ZS - Ascended Sage'),
    ('ZW - Lightning Blade'),
    ('ZW - Sleipnir Mail'),
    ('ZW - Tornado Bringer')
  ) as v(card_name)
  where (select count(*) from public.card_catalog c where c.name = v.card_name) <> 1;

  if v_missing is not null then
    raise exception 'Utopia route aborted: card name not found exactly once: %', v_missing;
  end if;

  insert into public.boss_routes (
    code,
    name,
    display_order,
    teaser_story,
    how_it_plays,
    star_profile,
    target_power_grade,
    is_active
  )
  values (
    's2_utopia',
    'Utopia',
    16,
    'A boy who never gives up, and the warrior of hope who answers when he calls. Every time it looks lost, the armour gets one piece heavier and the sword one piece brighter.',
    'Stack two Level 4 monsters into Utopia, stop attacks with it, then rank it up and strap ZW armour onto it until one warrior hits harder than anything your opponent can put in front of it.',
    '{"startStrength":3,"growth":3,"bossPower":4,"synergy":4,"flexibility":4}'::jsonb,
    'A',
    true
  )
  on conflict (code) do update set
    name = excluded.name,
    display_order = excluded.display_order,
    teaser_story = excluded.teaser_story,
    how_it_plays = excluded.how_it_plays,
    star_profile = excluded.star_profile,
    target_power_grade = excluded.target_power_grade,
    is_active = true;

  select id into strict v_route from public.boss_routes where code = 's2_utopia';

  insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
  select
    v_route,
    v.stage_number,
    c.id,
    (
      select s.dp_cost_to_reach
      from public.boss_route_stages s
      join public.boss_routes r on r.id = s.route_id
      where r.code = 's2_blue_eyes'
        and s.stage_number = v.stage_number
    )
  from (
    values
    (1, 'Number 39: Utopia'),
    (2, 'Number C39: Utopia Ray V'),
    (3, 'Number 39: Utopia Beyond'),
    (4, 'Number S39: Utopia the Lightning')
  ) as v(stage_number, card_name)
  join public.card_catalog c on c.name = v.card_name
  on conflict (route_id, stage_number) do update set
    evolution_card_catalog_id = excluded.evolution_card_catalog_id;

  delete from public.boss_route_stage_grants g
  using public.boss_route_stages s
  where s.id = g.stage_id
    and s.route_id = v_route;

  insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
  select s.id, c.id, v.is_route_exclusive, 1
  from (
    values
    (1, 'ZS - Armed Sage', true),
    (1, 'ZW - Sleipnir Mail', false),
    (1, 'ZS - Ascended Sage', true),
    (2, 'Rank-Up-Magic Limited Barian''s Force', false),
    (2, 'ZW - Tornado Bringer', false),
    (2, 'Utopia Buster', false),
    (3, 'Rank-Up-Magic Astral Force', false),
    (3, 'ZW - Lightning Blade', false),
    (3, 'Rising Sun Slash', false),
    (4, 'Halfway to Forever', true),
    (4, 'Reverse Breaker', false)
  ) as v(stage_number, card_name, is_route_exclusive)
  join public.boss_route_stages s on s.route_id = v_route and s.stage_number = v.stage_number
  join public.card_catalog c on c.name = v.card_name;
end;
$routes$;

commit;

-- =========================================================
-- bossg (production only, not in the migration)
-- =========================================================

begin;

do $bossg$
declare
  v_bossg uuid;
  v_league uuid;
  v_blockers text;
begin
  select id into strict v_bossg from public.profiles where username = 'bossg';
  select league_id into strict v_league from public.league_members where profile_id = v_bossg;

  create temp table ocean_cards on commit drop as
  select ci.id
  from public.card_instances ci
  join public.player_boss_paths p on p.id = ci.original_source_id
  join public.boss_routes r on r.id = p.route_id
  where p.profile_id = v_bossg
    and r.code = 's2_atlantean_ocean';

  select string_agg(blocker, ', ')
  into v_blockers
  from (
    select 'an Ocean route card in a deck, trade or wager' as blocker where exists (
      select 1 from public.deck_cards where card_instance_id in (select id from ocean_cards)
      union all
      select 1 from public.trade_items where card_instance_id in (select id from ocean_cards)
      union all
      select 1 from public.match_wager_cards where card_instance_id in (select id from ocean_cards)
    )
    union all
    select 'bossg is on neither Legendary Ocean nor Utopia' where not exists (
      select 1 from public.player_boss_paths p join public.boss_routes r on r.id = p.route_id
      where p.profile_id = v_bossg and r.code in ('s2_atlantean_ocean', 's2_utopia')
    )
  ) blockers;

  if v_blockers is not null then
    raise exception 'Route switch aborted: found %. Nothing changed - ask Claude.', v_blockers;
  end if;

  -- The 4 Ocean route cards. The delete guard on card_instances is the
  -- deliberate scarcity rule, so it is switched off only here, inside
  -- this transaction.
  delete from public.ownership_history
  where card_instance_id in (select id from ocean_cards);

  alter table public.card_instances disable trigger prevent_card_instance_delete_trigger;
  delete from public.card_instances where id in (select id from ocean_cards);
  alter table public.card_instances enable trigger prevent_card_instance_delete_trigger;

  -- His Ocean path (its unlocks cascade), then Utopia Stage 1.
  delete from public.player_boss_paths p
  using public.boss_routes r
  where r.id = p.route_id
    and p.profile_id = v_bossg
    and r.code = 's2_atlantean_ocean';

  if not exists (
    select 1
    from public.player_boss_paths p
    join public.boss_routes r on r.id = p.route_id
    where p.profile_id = v_bossg
      and r.code = 's2_utopia'
  ) then
    perform public._boss_path_start(
      v_bossg,
      v_league,
      1,
      (select id from public.boss_routes where code = 's2_utopia' and is_active),
      0
    );
  end if;
end;
$bossg$;

commit;

-- =========================================================
-- VERIFICATION (reads only)
-- =========================================================

select
  (
    select string_agg(r.code || ', stage ' || p.current_stage || ': ' || (
      select string_agg(c.name, ', ' order by c.name)
      from public.card_instances ci
      join public.card_catalog c on c.id = ci.card_catalog_id
      where ci.original_source_id = p.id
    ), ' | ')
    from public.player_boss_paths p
    join public.boss_routes r on r.id = p.route_id
    where p.profile_id = (select id from public.profiles where username = 'bossg')
  ) as bossg_route,
  (
    select count(*) from public.card_instances
    where current_owner_id = (select id from public.profiles where username = 'bossg')
  ) as bossg_cards,
  (
    (select count(*) from public.player_boss_paths where profile_id = (select id from public.profiles where username = 'bossg')) = 1
    and (
      select string_agg(c.name, ', ' order by c.name)
      from public.player_boss_paths p
      join public.boss_routes r on r.id = p.route_id
      join public.card_instances ci on ci.original_source_id = p.id
      join public.card_catalog c on c.id = ci.card_catalog_id
      where p.profile_id = (select id from public.profiles where username = 'bossg')
        and r.code = 's2_utopia'
        and p.current_stage = 1
    ) = 'Number 39: Utopia, ZS - Armed Sage, ZS - Ascended Sage, ZW - Sleipnir Mail'
    and (select string_agg(c.name, ', ' order by s.stage_number) from public.boss_route_stages s join public.card_catalog c on c.id = s.evolution_card_catalog_id join public.boss_routes r on r.id = s.route_id where r.code = 's2_utopia' and r.is_active)
      = 'Number 39: Utopia, Number C39: Utopia Ray V, Number 39: Utopia Beyond, Number S39: Utopia the Lightning'
    and (select count(*) from public.boss_route_stage_grants g join public.boss_route_stages s on s.id = g.stage_id join public.boss_routes r on r.id = s.route_id where r.code = 's2_utopia') = 11
    and (select count(*) from public.boss_routes where is_active) = 16
    and (select tgenabled from pg_trigger where tgname = 'prevent_card_instance_delete_trigger') = 'O'
  ) as checks_passed;
