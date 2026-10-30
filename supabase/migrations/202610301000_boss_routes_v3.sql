-- =========================================================
-- BOSS ROUTES V3: the 14 Season 2 Boss Paths
--
-- GENERATED FILE - do not hand-edit. Regenerate with:
--   node scripts/generate-boss-routes-v3-migration.mjs
-- from data/boss-route-registry-v3.mjs (design + balance notes there and
-- in docs/BOSS_PATHS_V3.md).
--
-- WHAT IT DOES (one transaction, re-runnable):
--   1. boss_routes.how_it_plays (new, nullable); display_order may go
--      up to 999 so retired routes can be parked at 100+.
--   2. Retires every route that is not one of the 14 (is_active =
--      false, display_order + 100). Retired routes that no player path
--      references are deleted (cascades to their stages / grants /
--      achievement rows; no card_instances row is touched). Routes a
--      player still has stay retired until the Season 2 reset wipes
--      player_boss_paths and deletes them
--      (scripts/season2/reset-and-activate.sql).
--   3. Upserts the 14 routes, their 4 stages and their support grants,
--      and removes grants that are no longer in the registry. Card ids
--      are looked up by name; any name that does not resolve to exactly
--      one card_catalog row aborts the whole migration.
--   4. Stage prices are NOT set here: each new stage copies the price
--      currently configured for that stage number on the existing
--      routes (900 / 1,400 / 2,400 before runbook step 2b, the approved
--      1,800 / 3,200 / 5,500 after it). An existing v3 stage keeps its
--      price on a re-run.
--   5. Boss-route exemption, tightened (classic v2 format):
--      - is_boss_route_exempt_card / is_boss_route_reserved_card only
--        look at ACTIVE routes;
--      - deck legality through the exemption is per OWNER: a route card
--        outside the pool is deck-legal only for a player who has that
--        route (is_duelist_circle_deck_legal_for + validate_deck_card);
--      - the exemption waives a banlist limit only for cards OUTSIDE
--        the pool; route cards inside the pool keep their limit.
--   No v3 route has achievement events: 2.0 evolution is DP only.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. Schema (additive)
-- ---------------------------------------------------------

alter table public.boss_routes
  add column if not exists how_it_plays text;

comment on column public.boss_routes.how_it_plays is
  'One line: how this route changes your game plan (shown on the route picker). Season 2 routes only.';

alter table public.boss_routes
  drop constraint if exists boss_routes_display_order_range;

alter table public.boss_routes
  add constraint boss_routes_display_order_range
  check (display_order between 1 and 999);

-- Stage prices: copy the price configured today for each stage number
-- (most common value on the other routes), BEFORE the old routes are
-- retired / deleted below. Never hardcoded here.
create temp table boss_v3_prices on commit drop as
select s.stage_number, mode() within group (order by s.dp_cost_to_reach) as dp_cost_to_reach
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
where s.stage_number in (2, 3, 4)
  and s.dp_cost_to_reach is not null
  and r.code not in ('s2_blue_eyes', 's2_red_eyes', 's2_elemental_hero', 's2_ancient_gear', 's2_crystal_beast', 's2_chaos_bls', 's2_six_samurai', 's2_gladiator_beast', 's2_zombie', 's2_harpie', 's2_toon', 's2_galaxy_eyes', 's2_atlantean_ocean', 's2_volcanic')
group by s.stage_number;

-- A re-run (no old routes left after the Season 2 reset) copies from
-- the v3 routes themselves.
insert into boss_v3_prices (stage_number, dp_cost_to_reach)
select s.stage_number, mode() within group (order by s.dp_cost_to_reach)
from public.boss_route_stages s
join public.boss_routes r on r.id = s.route_id
where s.stage_number in (2, 3, 4)
  and s.dp_cost_to_reach is not null
  and r.code in ('s2_blue_eyes', 's2_red_eyes', 's2_elemental_hero', 's2_ancient_gear', 's2_crystal_beast', 's2_chaos_bls', 's2_six_samurai', 's2_gladiator_beast', 's2_zombie', 's2_harpie', 's2_toon', 's2_galaxy_eyes', 's2_atlantean_ocean', 's2_volcanic')
  and s.stage_number not in (select stage_number from boss_v3_prices)
group by s.stage_number;

do $prices$
begin
  if (select count(*) from boss_v3_prices where dp_cost_to_reach > 0) <> 3 then
    raise exception 'BOSS ROUTES V3 ABORTED: no configured stage 2/3/4 price to copy (boss_route_stages has no priced stages).';
  end if;
end;
$prices$;

-- ---------------------------------------------------------
-- 2. Retire the old routes
-- ---------------------------------------------------------

update public.boss_routes
set is_active = false,
    display_order = case when display_order < 100 then display_order + 100 else display_order end
where code not in ('s2_blue_eyes', 's2_red_eyes', 's2_elemental_hero', 's2_ancient_gear', 's2_crystal_beast', 's2_chaos_bls', 's2_six_samurai', 's2_gladiator_beast', 's2_zombie', 's2_harpie', 's2_toon', 's2_galaxy_eyes', 's2_atlantean_ocean', 's2_volcanic')
  and (is_active or display_order < 100);

delete from public.boss_routes r
where r.code not in ('s2_blue_eyes', 's2_red_eyes', 's2_elemental_hero', 's2_ancient_gear', 's2_crystal_beast', 's2_chaos_bls', 's2_six_samurai', 's2_gladiator_beast', 's2_zombie', 's2_harpie', 's2_toon', 's2_galaxy_eyes', 's2_atlantean_ocean', 's2_volcanic')
  and not r.is_active
  and not exists (select 1 from public.player_boss_paths p where p.route_id = r.id)
  and not exists (
    select 1
    from public.player_boss_achievement_events pe
    join public.boss_route_achievement_events e on e.id = pe.event_id
    where e.route_id = r.id
  );

-- ---------------------------------------------------------
-- 3. The 14 routes
-- ---------------------------------------------------------

create temp table boss_v3_routes (
  code text primary key,
  name text not null,
  display_order integer not null,
  teaser_story text not null,
  how_it_plays text not null,
  star_profile jsonb not null,
  target_power_grade text not null
) on commit drop;

create temp table boss_v3_stages (
  code text not null,
  stage_number integer not null,
  card_name text not null,
  primary key (code, stage_number)
) on commit drop;

create temp table boss_v3_grants (
  code text not null,
  stage_number integer not null,
  card_name text not null,
  is_route_exclusive boolean not null,
  quantity integer not null,
  primary key (code, stage_number, card_name)
) on commit drop;

insert into boss_v3_routes (code, name, display_order, teaser_story, how_it_plays, star_profile, target_power_grade) values
  ('s2_blue_eyes', 'Blue-Eyes White Dragon', 1, 'Three white dragons, three thousand attack each, and a duelist who refused to believe in anything smaller. The legend says they were never meant to stay apart.', 'Pure power: cheat 3000-ATK dragons onto the field turn after turn, then fuse them into something your opponent''s monsters simply cannot fight.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":4,"flexibility":2}'::jsonb, 'A'),
  ('s2_red_eyes', 'Red-Eyes Black Dragon', 2, 'It was never the strongest dragon in the room, only the one with the most potential. Knock it down and it comes back angrier, and every fall leaves a scar on the other player.', 'Your graveyard is your hand: Red-Eyes keep coming back from the GY, and every big dragon that hits the field or the GY burns your opponent''s Life Points.', '{"startStrength":3,"growth":3,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A'),
  ('s2_elemental_hero', 'Elemental HERO', 3, 'Every hero has a weakness, which is why they never come alone. Two of them step into the light together, and something new walks out.', 'A toolbox: keep your heroes small, then fuse them into the exact answer the board needs - a monster-shrinker, a backrow-breaker or a burning finisher.', '{"startStrength":3,"growth":3,"bossPower":4,"synergy":4,"flexibility":5}'::jsonb, 'A'),
  ('s2_ancient_gear', 'Ancient Gear', 4, 'In a forgotten cellar under the academy, rusted gears begin to turn again. Every machine that climbs out is bigger than the last, and none of them lets you pull a trick while it swings.', 'Tribute small gears into giant ones: Ancient Gear monsters shut off your opponent''s Spells and Traps whenever they attack, so you win by building one huge, piercing machine and swinging into a board that cannot answer in battle.', '{"startStrength":3,"growth":3,"bossPower":4,"synergy":4,"flexibility":2}'::jsonb, 'A'),
  ('s2_crystal_beast', 'Crystal Beast', 5, 'Seven gems were sent across the sea, and the ship never arrived. The beasts sleep inside their crystals until someone gathers all seven - and then the sky turns every colour at once.', 'Your monsters never really die: a destroyed Crystal Beast turns into a gem in your Spell & Trap Zone. Collect gems to fuel a 4000-ATK thunder wall, and once seven different beasts are gathered, call a dragon that can send the whole field back to the Deck.', '{"startStrength":3,"growth":3,"bossPower":4,"synergy":5,"flexibility":2}'::jsonb, 'A'),
  ('s2_chaos_bls', 'Chaos Soldier', 6, 'Light and darkness, held in perfect balance by a warrior who was born from a ritual. Feed the graveyard one of each, and the balance tips - always in his favour.', 'Keep one LIGHT and one DARK monster in your graveyard at all times: they power the ritual soldiers and the Boss, who banish whatever stands in the way.', '{"startStrength":4,"growth":3,"bossPower":5,"synergy":4,"flexibility":3}'::jsonb, 'A'),
  ('s2_six_samurai', 'Six Samurai', 7, 'Six warriors swore an oath under one banner. Alone each one is just a sword, but they guard each other''s backs - and the clan''s oldest secret only wakes when three different clans stand side by side.', 'Swarm the field with samurai that summon each other for free and take hits for one another, then take the opponent apart one card per turn: they pop Spells and Traps, destroy monsters, and finally banish whatever is left.', '{"startStrength":3,"growth":3,"bossPower":4,"synergy":5,"flexibility":3}'::jsonb, 'A'),
  ('s2_gladiator_beast', 'Gladiator Beasts', 8, 'In the arena nobody fights twice in a row. When the trumpet sounds, the beast who just fought walks out of the gate and a fresh one walks in, angrier than the last.', 'Attack every turn, then tag your Gladiator Beast out for a fresh one from the Deck with a new effect - and shuffle three of them together into the Boss who stops spells and traps.', '{"startStrength":3,"growth":4,"bossPower":4,"synergy":5,"flexibility":3}'::jsonb, 'A'),
  ('s2_zombie', 'Zombie Horde', 9, 'You can destroy them. You can send them to the grave. It only makes them closer to home. The horde does not count its losses - it counts how many get back up.', 'Trade monsters freely, because the graveyard is a second hand: Zombies revive each other every turn, and the Boss turns every Zombie effect into a banish.', '{"startStrength":3,"growth":3,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A'),
  ('s2_harpie', 'Harpie Ladies', 10, 'Three sisters, one pet dragon and a hunting ground where no trap is safe. They are graceful, they are fast, and they never, ever come alone.', 'Flood the field with Harpie Ladies: each one that lands on the hunting ground pops a Spell or Trap, and a full flock blows up monsters and swoops in for direct hits.', '{"startStrength":3,"growth":4,"bossPower":3,"synergy":5,"flexibility":3}'::jsonb, 'A'),
  ('s2_toon', 'Toon World', 11, 'Inside the book, nobody gets hurt. The toons laugh, stretch and step right past your monsters - and by the time you figure out the rules, the last page has already been turned.', 'Open the book first: with Toon World on the field your Toons attack your opponent directly over their monsters, while the Kingdom keeps them safe from removal.', '{"startStrength":4,"growth":3,"bossPower":4,"synergy":5,"flexibility":2}'::jsonb, 'A'),
  ('s2_galaxy_eyes', 'Galaxy-Eyes Photon', 12, 'A dragon made of starlight, hunting through the dark between the galaxies. When two of them meet, they become a number - and numbers do not lose.', 'Make Level 8s fast with Photon and Galaxy monsters, stack two of them into a Rank 8 Xyz, and let the Boss shut off every other effect on the field before it attacks twice.', '{"startStrength":3,"growth":3,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A'),
  ('s2_atlantean_ocean', 'Legendary Ocean', 13, 'An old fisherman knows the sea better than anyone. He knows where the serpents sleep, which tide pulls ships under, and that one day the ocean itself will rise and wash the whole board clean.', 'Play around the Umi field spell: your sea serpents get stronger, your Atlanteans pop cards whenever they are used as a cost, and the Boss can sacrifice the ocean to wipe the field.', '{"startStrength":3,"growth":3,"bossPower":4,"synergy":4,"flexibility":3}'::jsonb, 'A'),
  ('s2_volcanic', 'Volcanic Inferno', 14, 'Deep under the mountain the fire never sleeps. Small sparks become cannons, cannons become eruptions, and every monster that stands near the crater pays the price in Life Points.', 'Win without attacking: feed small Volcanics to the Blaze Accelerators to destroy monsters and burn Life Points, then let the Boss melt the whole opposing field.', '{"startStrength":4,"growth":3,"bossPower":4,"synergy":4,"flexibility":2}'::jsonb, 'A');

insert into boss_v3_stages (code, stage_number, card_name) values
  ('s2_blue_eyes', 1, 'Blue-Eyes White Dragon'),
  ('s2_blue_eyes', 2, 'Blue-Eyes Alternative White Dragon'),
  ('s2_blue_eyes', 3, 'Blue-Eyes Twin Burst Dragon'),
  ('s2_blue_eyes', 4, 'Neo Blue-Eyes Ultimate Dragon'),
  ('s2_red_eyes', 1, 'Red-Eyes Black Dragon'),
  ('s2_red_eyes', 2, 'Red-Eyes Darkness Dragon'),
  ('s2_red_eyes', 3, 'Red-Eyes Darkness Metal Dragon'),
  ('s2_red_eyes', 4, 'Red-Eyes Flare Metal Dragon'),
  ('s2_elemental_hero', 1, 'Elemental HERO Sparkman'),
  ('s2_elemental_hero', 2, 'Elemental HERO Flame Wingman'),
  ('s2_elemental_hero', 3, 'Elemental HERO Great Tornado'),
  ('s2_elemental_hero', 4, 'Elemental HERO Shining Flare Wingman'),
  ('s2_ancient_gear', 1, 'Ancient Gear Soldier'),
  ('s2_ancient_gear', 2, 'Ancient Gear Engineer'),
  ('s2_ancient_gear', 3, 'Ancient Gear Golem'),
  ('s2_ancient_gear', 4, 'Ultimate Ancient Gear Golem'),
  ('s2_crystal_beast', 1, 'Crystal Beast Sapphire Pegasus'),
  ('s2_crystal_beast', 2, 'Crystal Beast Rainbow Dragon'),
  ('s2_crystal_beast', 3, 'Hamon, Lord of Striking Thunder'),
  ('s2_crystal_beast', 4, 'Rainbow Dragon'),
  ('s2_chaos_bls', 1, 'Black Luster Soldier'),
  ('s2_chaos_bls', 2, 'Black Luster Soldier - Super Soldier'),
  ('s2_chaos_bls', 3, 'Chaos Sorcerer'),
  ('s2_chaos_bls', 4, 'Black Luster Soldier - Envoy of the Beginning'),
  ('s2_six_samurai', 1, 'The Six Samurai - Zanji'),
  ('s2_six_samurai', 2, 'Grandmaster of the Six Samurai'),
  ('s2_six_samurai', 3, 'Enishi, Shien''s Chancellor'),
  ('s2_six_samurai', 4, 'Secret Six Samurai - Rihan'),
  ('s2_gladiator_beast', 1, 'Gladiator Beast Laquari'),
  ('s2_gladiator_beast', 2, 'Gladiator Beast Darius'),
  ('s2_gladiator_beast', 3, 'Gladiator Beast Gyzarus'),
  ('s2_gladiator_beast', 4, 'Gladiator Beast Heraklinos'),
  ('s2_zombie', 1, 'Zombie Master'),
  ('s2_zombie', 2, 'Il Blud'),
  ('s2_zombie', 3, 'Despair from the Dark'),
  ('s2_zombie', 4, 'Doomking Balerdroch'),
  ('s2_harpie', 1, 'Harpie Channeler'),
  ('s2_harpie', 2, 'Harpie Lady Sisters'),
  ('s2_harpie', 3, 'Harpie''s Pet Dragon'),
  ('s2_harpie', 4, 'Harpie''s Pet Phantasmal Dragon'),
  ('s2_toon', 1, 'Toon Masked Sorcerer'),
  ('s2_toon', 2, 'Toon Summoned Skull'),
  ('s2_toon', 3, 'Toon Dark Magician'),
  ('s2_toon', 4, 'Toon Black Luster Soldier'),
  ('s2_galaxy_eyes', 1, 'Photon Thrasher'),
  ('s2_galaxy_eyes', 2, 'Galaxy-Eyes Photon Dragon'),
  ('s2_galaxy_eyes', 3, 'Number 62: Galaxy-Eyes Prime Photon Dragon'),
  ('s2_galaxy_eyes', 4, 'Number 107: Galaxy-Eyes Tachyon Dragon'),
  ('s2_atlantean_ocean', 1, 'The Legendary Fisherman'),
  ('s2_atlantean_ocean', 2, 'The Legendary Fisherman II'),
  ('s2_atlantean_ocean', 3, 'Poseidra, the Atlantean Dragon'),
  ('s2_atlantean_ocean', 4, 'Levia-Dragon - Daedalus'),
  ('s2_volcanic', 1, 'Volcanic Rocket'),
  ('s2_volcanic', 2, 'Volcanic Hammerer'),
  ('s2_volcanic', 3, 'Volcanic Emperor'),
  ('s2_volcanic', 4, 'Volcanic Doomfire');

insert into boss_v3_grants (code, stage_number, card_name, is_route_exclusive, quantity) values
  ('s2_blue_eyes', 1, 'The White Stone of Legend', false, 1),
  ('s2_blue_eyes', 1, 'Trade-In', false, 1),
  ('s2_blue_eyes', 1, 'Return of the Dragon Lords', false, 1),
  ('s2_blue_eyes', 2, 'Sage with Eyes of Blue', true, 1),
  ('s2_blue_eyes', 2, 'The Melody of Awakening Dragon', true, 1),
  ('s2_blue_eyes', 2, 'Maiden with Eyes of Blue', false, 1),
  ('s2_blue_eyes', 3, 'Dragon''s Mirror', false, 1),
  ('s2_blue_eyes', 3, 'Dragon Spirit of White', true, 1),
  ('s2_blue_eyes', 3, 'Burst Stream of Destruction', false, 1),
  ('s2_blue_eyes', 4, 'Blue-Eyes Ultimate Dragon', false, 1),
  ('s2_blue_eyes', 4, 'The White Stone of Ancients', true, 1),
  ('s2_red_eyes', 1, 'Red-Eyes Insight', true, 1),
  ('s2_red_eyes', 1, 'Red-Eyes Spirit', true, 1),
  ('s2_red_eyes', 1, 'Red-Eyes Wyvern', false, 1),
  ('s2_red_eyes', 2, 'Red-Eyes Fusion', false, 1),
  ('s2_red_eyes', 2, 'Return of the Red-Eyes', true, 1),
  ('s2_red_eyes', 2, 'Cards of the Red Stone', true, 1),
  ('s2_red_eyes', 3, 'Red-Eyes Black Flare Dragon', true, 1),
  ('s2_red_eyes', 3, 'Red-Eyes Retro Dragon', true, 1),
  ('s2_red_eyes', 3, 'Inferno Fire Blast', false, 1),
  ('s2_red_eyes', 4, 'Red-Eyes Burn', true, 1),
  ('s2_red_eyes', 4, 'Red-Eyes Archfiend of Lightning', true, 1),
  ('s2_elemental_hero', 1, 'Polymerization', false, 1),
  ('s2_elemental_hero', 1, 'E - Emergency Call', false, 1),
  ('s2_elemental_hero', 1, 'Elemental HERO Shadow Mist', false, 1),
  ('s2_elemental_hero', 2, 'Elemental HERO Avian', false, 1),
  ('s2_elemental_hero', 2, 'Elemental HERO Liquid Soldier', true, 1),
  ('s2_elemental_hero', 2, 'Elemental HERO Burstinatrix', false, 1),
  ('s2_elemental_hero', 3, 'Mask Change', false, 1),
  ('s2_elemental_hero', 3, 'Elemental HERO Sunrise', true, 1),
  ('s2_elemental_hero', 3, 'Masked HERO Divine Wind', true, 1),
  ('s2_elemental_hero', 4, 'Miracle Fusion', false, 1),
  ('s2_elemental_hero', 4, 'Fifth Hope', false, 1),
  ('s2_ancient_gear', 1, 'Ancient Gear Wyvern', true, 1),
  ('s2_ancient_gear', 1, 'Ancient Gear Box', false, 1),
  ('s2_ancient_gear', 1, 'Geartown', false, 1),
  ('s2_ancient_gear', 2, 'Ancient Gear Beast', false, 1),
  ('s2_ancient_gear', 2, 'Ancient Gear Reborn', true, 1),
  ('s2_ancient_gear', 2, 'Ancient Gear Fist', false, 1),
  ('s2_ancient_gear', 3, 'Ancient Gear Frame', true, 1),
  ('s2_ancient_gear', 3, 'Ancient Gear Hunting Hound', true, 1),
  ('s2_ancient_gear', 3, 'Ancient Gear Workshop', false, 1),
  ('s2_ancient_gear', 4, 'Ancient Gear Gadjiltron Dragon', false, 1),
  ('s2_ancient_gear', 4, 'Ancient Gear Castle', false, 1),
  ('s2_crystal_beast', 1, 'Crystal Beast Ruby Carbuncle', false, 1),
  ('s2_crystal_beast', 1, 'Crystal Bond', true, 1),
  ('s2_crystal_beast', 1, 'Rare Value', false, 1),
  ('s2_crystal_beast', 2, 'Crystal Beast Amethyst Cat', false, 1),
  ('s2_crystal_beast', 2, 'Crystal Beast Topaz Tiger', false, 1),
  ('s2_crystal_beast', 2, 'Crystal Conclave', true, 1),
  ('s2_crystal_beast', 3, 'Ancient City - Rainbow Ruins', false, 1),
  ('s2_crystal_beast', 3, 'Crystal Beast Amber Mammoth', false, 1),
  ('s2_crystal_beast', 3, 'Crystal Beast Cobalt Eagle', false, 1),
  ('s2_crystal_beast', 4, 'Crystal Beast Emerald Tortoise', false, 1),
  ('s2_crystal_beast', 4, 'Rainbow Path', false, 1),
  ('s2_chaos_bls', 1, 'Super Soldier Synthesis', true, 1),
  ('s2_chaos_bls', 1, 'Gateway to Chaos', true, 1),
  ('s2_chaos_bls', 1, 'D.D. Warrior Lady', false, 1),
  ('s2_chaos_bls', 2, 'Envoy of Chaos', true, 1),
  ('s2_chaos_bls', 2, 'Chaos Valkyria', true, 1),
  ('s2_chaos_bls', 2, 'Sonic Bird', false, 1),
  ('s2_chaos_bls', 3, 'Super Soldier Rebirth', true, 1),
  ('s2_chaos_bls', 3, 'Chaos Seed', false, 1),
  ('s2_chaos_bls', 3, 'Gaia The Fierce Knight', false, 1),
  ('s2_chaos_bls', 4, 'Super Soldier Shield', true, 1),
  ('s2_chaos_bls', 4, 'Black Luster Ritual', false, 1),
  ('s2_six_samurai', 1, 'Shien''s Smoke Signal', false, 1),
  ('s2_six_samurai', 1, 'Legendary Six Samurai - Kizan', false, 1),
  ('s2_six_samurai', 1, 'The Six Samurai - Yaichi', false, 1),
  ('s2_six_samurai', 2, 'Six Samurai United', false, 1),
  ('s2_six_samurai', 2, 'Secret Six Samurai - Kizaru', true, 1),
  ('s2_six_samurai', 2, 'The Six Samurai - Kamon', false, 1),
  ('s2_six_samurai', 3, 'Musakani Magatama', false, 1),
  ('s2_six_samurai', 3, 'Six Strike - Double Assault', true, 1),
  ('s2_six_samurai', 3, 'Shien''s Squire', false, 1),
  ('s2_six_samurai', 4, 'Secret Skills of the Six Samurai', true, 1),
  ('s2_six_samurai', 4, 'The Six Samurai - Irou', false, 1),
  ('s2_gladiator_beast', 1, 'Gladiator Proving Ground', false, 1),
  ('s2_gladiator_beast', 1, 'Test Tiger', false, 1),
  ('s2_gladiator_beast', 1, 'Gladiator Beast Equeste', false, 1),
  ('s2_gladiator_beast', 2, 'Gladiator Beast Murmillo', false, 1),
  ('s2_gladiator_beast', 2, 'Gladiator Beast War Chariot', false, 1),
  ('s2_gladiator_beast', 2, 'Gladiator Beast Noxious', true, 1),
  ('s2_gladiator_beast', 3, 'Gladiator Beast Bestiari', false, 1),
  ('s2_gladiator_beast', 3, 'Gladiator Beast''s Respite', false, 1),
  ('s2_gladiator_beast', 3, 'Gladiator Beast Sagittarii', true, 1),
  ('s2_gladiator_beast', 4, 'Gladiator Beast United', true, 1),
  ('s2_gladiator_beast', 4, 'Gladiator Beast Hoplomus', false, 1),
  ('s2_zombie', 1, 'Book of Life', false, 1),
  ('s2_zombie', 1, 'Goblin Zombie', false, 1),
  ('s2_zombie', 1, 'Pyramid Turtle', false, 1),
  ('s2_zombie', 2, 'Mezuki', false, 1),
  ('s2_zombie', 2, 'Mystic Plasma Zone', false, 1),
  ('s2_zombie', 2, 'Gozuki', true, 1),
  ('s2_zombie', 3, 'Shutendoji', false, 1),
  ('s2_zombie', 3, 'Zombie Necronize', true, 1),
  ('s2_zombie', 3, 'Red-Eyes Zombie Dragon', false, 1),
  ('s2_zombie', 4, 'Zombie Power Struggle', true, 1),
  ('s2_zombie', 4, 'Vampire Lord', false, 1),
  ('s2_harpie', 1, 'Harpies'' Hunting Ground', false, 1),
  ('s2_harpie', 1, 'Elegant Egotist', false, 1),
  ('s2_harpie', 1, 'Harpie Queen', false, 1),
  ('s2_harpie', 2, 'Hysteric Sign', false, 1),
  ('s2_harpie', 2, 'Harpie Perfumer', true, 1),
  ('s2_harpie', 2, 'Harpie Lady Elegance', true, 1),
  ('s2_harpie', 3, 'Harpie Lady Phoenix Formation', false, 1),
  ('s2_harpie', 3, 'Harpie''s Pet Baby Dragon', false, 1),
  ('s2_harpie', 3, 'Harpie''s Feather Storm', true, 1),
  ('s2_harpie', 4, 'Harpie Harpist', true, 1),
  ('s2_harpie', 4, 'Hysteric Party', false, 1),
  ('s2_toon', 1, 'Toon World', false, 1),
  ('s2_toon', 1, 'Toon Table of Contents', false, 1),
  ('s2_toon', 1, 'Toon Kingdom', false, 1),
  ('s2_toon', 2, 'Toon Bookmark', true, 1),
  ('s2_toon', 2, 'Toon Harpie Lady', true, 1),
  ('s2_toon', 2, 'Toon Defense', false, 1),
  ('s2_toon', 3, 'Toon Page-Flip', true, 1),
  ('s2_toon', 3, 'Shadow Toon', true, 1),
  ('s2_toon', 3, 'Toon Goblin Attack Force', false, 1),
  ('s2_toon', 4, 'Toon Gemini Elf', false, 1),
  ('s2_toon', 4, 'Toon Mermaid', false, 1),
  ('s2_galaxy_eyes', 1, 'Galaxy Soldier', true, 1),
  ('s2_galaxy_eyes', 1, 'Photon Vanisher', true, 1),
  ('s2_galaxy_eyes', 1, 'Photon Lead', false, 1),
  ('s2_galaxy_eyes', 2, 'Galaxy Expedition', false, 1),
  ('s2_galaxy_eyes', 2, 'Galaxy Wizard', false, 1),
  ('s2_galaxy_eyes', 2, 'Photon Orbital', true, 1),
  ('s2_galaxy_eyes', 3, 'Photon Stream of Destruction', true, 1),
  ('s2_galaxy_eyes', 3, 'Galaxy Knight', false, 1),
  ('s2_galaxy_eyes', 3, 'Xyz Reborn', false, 1),
  ('s2_galaxy_eyes', 4, 'Galaxy-Eyes Cipher Dragon', true, 1),
  ('s2_galaxy_eyes', 4, 'Galaxy Dragon', false, 1),
  ('s2_atlantean_ocean', 1, 'Umi', false, 1),
  ('s2_atlantean_ocean', 1, 'Atlantean Heavy Infantry', false, 1),
  ('s2_atlantean_ocean', 1, 'Codarus', false, 1),
  ('s2_atlantean_ocean', 2, 'Atlantean Marksman', false, 1),
  ('s2_atlantean_ocean', 2, 'A Legendary Ocean', false, 1),
  ('s2_atlantean_ocean', 2, 'Big Wave Small Wave', false, 1),
  ('s2_atlantean_ocean', 3, 'Sea Stealth Attack', true, 1),
  ('s2_atlantean_ocean', 3, 'Mother Grizzly', false, 1),
  ('s2_atlantean_ocean', 3, 'Atlantean Attack Squad', false, 1),
  ('s2_atlantean_ocean', 4, 'Citadel Whale', true, 1),
  ('s2_atlantean_ocean', 4, 'Salvage', false, 1),
  ('s2_volcanic', 1, 'Blaze Accelerator', false, 1),
  ('s2_volcanic', 1, 'Volcanic Shell', false, 1),
  ('s2_volcanic', 1, 'Volcanic Scattershot', false, 1),
  ('s2_volcanic', 2, 'Tri-Blaze Accelerator', false, 1),
  ('s2_volcanic', 2, 'Volcanic Trooper', true, 1),
  ('s2_volcanic', 2, 'Volcanic Counter', false, 1),
  ('s2_volcanic', 3, 'Volcanic Blaze Accelerator', true, 1),
  ('s2_volcanic', 3, 'Volcanic Rimfire', true, 1),
  ('s2_volcanic', 3, 'Volcanic Slicer', false, 1),
  ('s2_volcanic', 4, 'Volcanic Emission', true, 1),
  ('s2_volcanic', 4, 'Volcanic Blaster', false, 1);

-- Every card name must resolve to exactly one card_catalog row.
do $names$
declare
  v_missing text;
begin
  select string_agg(format('%s (%s)', n.card_name, coalesce(m.hits, 0)), ', ' order by n.card_name)
  into v_missing
  from (
    select card_name from boss_v3_stages
    union
    select card_name from boss_v3_grants
  ) n
  left join (
    select c.name, count(*) as hits
    from public.card_catalog c
    group by c.name
  ) m on m.name = n.card_name
  where coalesce(m.hits, 0) <> 1;

  if v_missing is not null then
    raise exception 'BOSS ROUTES V3 ABORTED: these card names do not match exactly one card_catalog row: %', v_missing;
  end if;
end;
$names$;

insert into public.boss_routes (code, name, display_order, teaser_story, how_it_plays, star_profile, target_power_grade, is_active)
select code, name, display_order, teaser_story, how_it_plays, star_profile, target_power_grade, true
from boss_v3_routes
on conflict (code) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  teaser_story = excluded.teaser_story,
  how_it_plays = excluded.how_it_plays,
  star_profile = excluded.star_profile,
  target_power_grade = excluded.target_power_grade,
  is_active = true;

-- Evolution cards. The (route_id, evolution_card_catalog_id) unique
-- check could trip if a re-run moved a card between two stages of the
-- same route; clear the stage rows whose card changes first (their
-- grants are re-inserted below, players keep their unlock rows).
update public.boss_route_stages s
set evolution_card_catalog_id = c.id
from boss_v3_stages v
join public.boss_routes r on r.code = v.code
join public.card_catalog c on c.name = v.card_name
where s.route_id = r.id
  and s.stage_number = v.stage_number
  and s.evolution_card_catalog_id <> c.id
  and not exists (
    select 1 from public.boss_route_stages other
    where other.route_id = r.id and other.evolution_card_catalog_id = c.id and other.id <> s.id
  );

insert into public.boss_route_stages (route_id, stage_number, evolution_card_catalog_id, dp_cost_to_reach)
select r.id, v.stage_number, c.id, case when v.stage_number = 1 then null else p.dp_cost_to_reach end
from boss_v3_stages v
join public.boss_routes r on r.code = v.code
join public.card_catalog c on c.name = v.card_name
left join boss_v3_prices p on p.stage_number = v.stage_number
on conflict (route_id, stage_number) do nothing;

-- Support grants: remove what is no longer in the registry, upsert the rest.
delete from public.boss_route_stage_grants g
using public.boss_route_stages s, public.boss_routes r, public.card_catalog c
where g.stage_id = s.id
  and s.route_id = r.id
  and c.id = g.card_catalog_id
  and r.code in (select code from boss_v3_routes)
  and not exists (
    select 1 from boss_v3_grants v
    where v.code = r.code and v.stage_number = s.stage_number and v.card_name = c.name
  );

insert into public.boss_route_stage_grants (stage_id, card_catalog_id, is_route_exclusive, quantity)
select s.id, c.id, v.is_route_exclusive, v.quantity
from boss_v3_grants v
join public.boss_routes r on r.code = v.code
join public.boss_route_stages s on s.route_id = r.id and s.stage_number = v.stage_number
join public.card_catalog c on c.name = v.card_name
on conflict (stage_id, card_catalog_id) do update set
  is_route_exclusive = excluded.is_route_exclusive,
  quantity = excluded.quantity;

-- ---------------------------------------------------------
-- 5. Boss-route exemption (Classic v2), tightened
-- ---------------------------------------------------------

-- Exempt set = evolution cards (any stage) + exclusive grants of ACTIVE
-- routes. Same signature as 202610121010.
create or replace function public.is_boss_route_exempt_card(
  target_card_catalog_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.boss_route_stages s
    join public.boss_routes r on r.id = s.route_id
    where s.evolution_card_catalog_id = target_card_catalog_id
      and r.is_active
  )
  or exists (
    select 1
    from public.boss_route_stage_grants g
    join public.boss_route_stages s on s.id = g.stage_id
    join public.boss_routes r on r.id = s.route_id
    where g.card_catalog_id = target_card_catalog_id
      and g.is_route_exclusive = true
      and r.is_active
  );
$$;

comment on function public.is_boss_route_exempt_card(uuid) is
  'Boss evolution monster (any stage) or route-exclusive support grant of an ACTIVE route. Card-level; deck legality is per owner (is_duelist_circle_deck_legal_for).';

revoke all on function public.is_boss_route_exempt_card(uuid) from public;
grant execute on function public.is_boss_route_exempt_card(uuid) to authenticated;

-- Reserved set (never offered by packs / draft / shop singles): stage 4
-- Bosses + exclusive grants of ACTIVE routes. Same signature as
-- 202610120140. (The inline copies in the draft / pack pickers read the
-- tables directly; the Season 2 reset deletes retired routes, so they
-- end up on the same set.)
create or replace function public.is_boss_route_reserved_card(
  target_card_catalog_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.boss_route_stages brs
    join public.boss_routes r on r.id = brs.route_id
    where brs.evolution_card_catalog_id = target_card_catalog_id
      and brs.stage_number = 4
      and r.is_active
  )
  or exists (
    select 1
    from public.boss_route_stage_grants brg
    join public.boss_route_stages brs on brs.id = brg.stage_id
    join public.boss_routes r on r.id = brs.route_id
    where brg.card_catalog_id = target_card_catalog_id
      and brg.is_route_exclusive = true
      and r.is_active
  );
$$;

comment on function public.is_boss_route_reserved_card(uuid) is
  'True for a Stage-4 Boss or an is_route_exclusive support card of an ACTIVE Boss Route: these only come from the Boss Path, never from packs, draft or shop singles.';

-- Owner check: does this profile have an active route that hands out
-- this card (as an evolution or an exclusive grant)?
create or replace function public.is_boss_route_exempt_for_profile(
  target_card_catalog_id uuid,
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.player_boss_paths p
    join public.boss_routes r on r.id = p.route_id and r.is_active
    join public.boss_route_stages s on s.route_id = r.id
    where p.profile_id = target_profile_id
      and s.evolution_card_catalog_id = target_card_catalog_id
  )
  or exists (
    select 1
    from public.player_boss_paths p
    join public.boss_routes r on r.id = p.route_id and r.is_active
    join public.boss_route_stages s on s.route_id = r.id
    join public.boss_route_stage_grants g on g.stage_id = s.id
    where p.profile_id = target_profile_id
      and g.card_catalog_id = target_card_catalog_id
      and g.is_route_exclusive = true
  );
$$;

comment on function public.is_boss_route_exempt_for_profile(uuid, uuid) is
  'True when the profile has an active Boss Route whose evolution cards or exclusive grants include this card.';

revoke all on function public.is_boss_route_exempt_for_profile(uuid, uuid) from public, anon;
grant execute on function public.is_boss_route_exempt_for_profile(uuid, uuid) to authenticated;

-- Deck legality for a specific deck owner: format_eligible, or (active
-- format with boss_route_exempt) a route card of a route this owner has.
-- not_available in Master Duel and explicit excludes always block.
create or replace function public.is_duelist_circle_deck_legal_for(
  target_card_catalog_id uuid,
  target_profile_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  card public.card_catalog;
  fmt public.duelist_circle_formats;
begin
  select * into card from public.card_catalog where id = target_card_catalog_id;
  if card is null then
    return false;
  end if;

  if card.format_eligible then
    return true;
  end if;

  select * into fmt from public.duelist_circle_formats where is_active = true limit 1;

  if fmt is null or not fmt.boss_route_exempt then
    return false;
  end if;

  if coalesce(card.master_duel_status, 'unknown') = 'not_available' then
    return false;
  end if;

  if exists (
    select 1
    from public.format_card_overrides o
    where o.format_id = fmt.id
      and o.card_catalog_id = card.id
      and o.override_type = 'exclude'
  ) then
    return false;
  end if;

  return public.is_boss_route_exempt_for_profile(card.id, target_profile_id);
end;
$$;

comment on function public.is_duelist_circle_deck_legal_for(uuid, uuid) is
  'May THIS player put a copy of this card in a deck? format_eligible, or - active format with boss_route_exempt - an evolution / exclusive grant of a Boss Route the player has. Used by validate_deck_card. is_duelist_circle_deck_legal(card) stays as the card-level (any owner) answer.';

revoke all on function public.is_duelist_circle_deck_legal_for(uuid, uuid) from public, anon;
grant execute on function public.is_duelist_circle_deck_legal_for(uuid, uuid) to authenticated;

-- Banlist limit: the exemption only waives a limit for a route card that
-- is OUTSIDE the pool (not format_eligible, e.g. Dark Magician of
-- Chaos). Route cards inside the pool keep their normal limit, so a
-- route never lets its owner play extra copies of a limited pool card.
create or replace function public.duelist_circle_deck_copy_limit(
  target_card_catalog_id uuid,
  target_format_code text default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fmt public.duelist_circle_formats;
begin
  if target_format_code is null then
    select * into fmt from public.duelist_circle_formats where is_active = true limit 1;
  else
    select * into fmt from public.duelist_circle_formats where code = target_format_code;
  end if;

  if fmt is null then
    return null;
  end if;

  if fmt.boss_route_exempt
    and public.is_boss_route_exempt_card(target_card_catalog_id)
    and not coalesce((select c.format_eligible from public.card_catalog c where c.id = target_card_catalog_id), false)
  then
    return null;
  end if;

  return (
    select l.max_copies
    from public.duelist_circle_card_limits l
    where l.format_code = fmt.code
      and l.card_catalog_id = target_card_catalog_id
  );
end;
$$;

comment on function public.duelist_circle_deck_copy_limit(uuid, text) is
  'Max copies of a card per deck under our own banlist (0/1/2), or null = no extra limit. Boss-route exemption: no limit only for a route card outside the pool. Default format = the active one; no active format = null (no limits).';

revoke all on function public.duelist_circle_deck_copy_limit(uuid, text) from public;
grant execute on function public.duelist_circle_deck_copy_limit(uuid, text) to authenticated;

-- validate_deck_card: identical to 202610121010 except that legality is
-- now asked for the deck owner (is_duelist_circle_deck_legal_for).
create or replace function public.validate_deck_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner_id uuid;
  target_league_id uuid;

  instance_owner_id uuid;
  instance_league_id uuid;
  instance_locked boolean;

  target_card_type text;
  target_catalog_id uuid;

  current_main_count integer;
  current_extra_count integer;

  main_max integer;
  extra_max integer;
begin
  select d.owner_id, d.league_id
  into target_owner_id, target_league_id
  from public.decks d
  where d.id = new.deck_id;

  if not found then
    raise exception 'Deck does not exist';
  end if;

  select ci.current_owner_id, ci.league_id, ci.locked, cc.card_type, cc.id
  into instance_owner_id, instance_league_id, instance_locked, target_card_type, target_catalog_id
  from public.card_instances ci
  join public.card_catalog cc on cc.id = ci.card_catalog_id
  where ci.id = new.card_instance_id;

  if not found then
    raise exception 'Card instance does not exist';
  end if;

  if instance_owner_id <> target_owner_id then
    raise exception 'You do not own this card instance';
  end if;

  if instance_league_id <> target_league_id then
    raise exception 'Card instance belongs to another league';
  end if;

  if instance_locked = true then
    raise exception 'Locked cards cannot be added to a deck';
  end if;

  if not public.is_duelist_circle_deck_legal_for(target_catalog_id, target_owner_id) then
    raise exception 'This card is not legal in the Duelist Circle format';
  end if;

  -- Fusion + XYZ go to the Extra Deck, everything else to Main.
  if (
    lower(target_card_type) like '%fusion%monster%'
    or lower(target_card_type) like '%xyz%monster%'
  ) then
    if new.section <> 'extra' then
      raise exception 'Fusion and XYZ Monsters must be placed in the Extra Deck';
    end if;
  else
    if new.section <> 'main' then
      raise exception 'Only Fusion and XYZ Monsters may be placed in the Extra Deck';
    end if;
  end if;

  main_max := public.get_deck_setting(target_league_id, 'deck.main_max', 60);
  extra_max := public.get_deck_setting(target_league_id, 'deck.extra_max', 15);

  select count(*)
  into current_main_count
  from public.deck_cards dc
  where dc.deck_id = new.deck_id
    and dc.section = 'main'
    and (tg_op = 'INSERT' or dc.id <> new.id);

  select count(*)
  into current_extra_count
  from public.deck_cards dc
  where dc.deck_id = new.deck_id
    and dc.section = 'extra'
    and (tg_op = 'INSERT' or dc.id <> new.id);

  if new.section = 'main' and current_main_count >= main_max then
    raise exception 'Main Deck is full. Maximum: %', main_max;
  end if;

  if new.section = 'extra' and current_extra_count >= extra_max then
    raise exception 'Extra Deck is full. Maximum: %', extra_max;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------
-- 6. Verify
-- ---------------------------------------------------------

do $verify$
declare
  v_active integer;
  v_stages integer;
  v_grants integer;
  v_expected_grants integer := (select count(*) from boss_v3_grants);
  v_bad_stage text;
  v_bad_card text;
begin
  select count(*) into v_active from public.boss_routes where is_active;
  if v_active <> (select count(*) from boss_v3_routes) then
    raise exception 'BOSS ROUTES V3 ABORTED: % active routes, expected %', v_active, (select count(*) from boss_v3_routes);
  end if;

  if exists (select 1 from public.boss_routes where is_active and code not in (select code from boss_v3_routes)) then
    raise exception 'BOSS ROUTES V3 ABORTED: a non-v3 route is still active';
  end if;

  select count(*) into v_stages
  from public.boss_route_stages s
  join public.boss_routes r on r.id = s.route_id
  where r.is_active;
  if v_stages <> 4 * v_active then
    raise exception 'BOSS ROUTES V3 ABORTED: % stages for % active routes', v_stages, v_active;
  end if;

  select string_agg(r.code || ' stage ' || s.stage_number, ', ') into v_bad_stage
  from public.boss_route_stages s
  join public.boss_routes r on r.id = s.route_id
  left join boss_v3_stages v on v.code = r.code and v.stage_number = s.stage_number
  left join public.card_catalog c on c.id = s.evolution_card_catalog_id
  where r.is_active
    and (v.card_name is distinct from c.name
         or (s.stage_number = 1 and s.dp_cost_to_reach is not null)
         or (s.stage_number > 1 and coalesce(s.dp_cost_to_reach, 0) <= 0));
  if v_bad_stage is not null then
    raise exception 'BOSS ROUTES V3 ABORTED: stage card or price wrong for %', v_bad_stage;
  end if;

  select count(*) into v_grants
  from public.boss_route_stage_grants g
  join public.boss_route_stages s on s.id = g.stage_id
  join public.boss_routes r on r.id = s.route_id
  where r.is_active;
  if v_grants <> v_expected_grants then
    raise exception 'BOSS ROUTES V3 ABORTED: % grants on active routes, expected %', v_grants, v_expected_grants;
  end if;

  select string_agg(c.name, ', ') into v_bad_card
  from public.boss_route_stages s
  join public.boss_routes r on r.id = s.route_id
  join public.card_catalog c on c.id = s.evolution_card_catalog_id
  where r.is_active
    and (coalesce(c.card_type, '') ~* '(synchro|link|pendulum)' or coalesce(c.frame_type, '') ~* '(synchro|link|pendulum)');
  if v_bad_card is null then
    select string_agg(c.name, ', ') into v_bad_card
    from public.boss_route_stage_grants g
    join public.boss_route_stages s on s.id = g.stage_id
    join public.boss_routes r on r.id = s.route_id
    join public.card_catalog c on c.id = g.card_catalog_id
    where r.is_active
      and (coalesce(c.card_type, '') ~* '(synchro|link|pendulum)' or coalesce(c.frame_type, '') ~* '(synchro|link|pendulum)');
  end if;
  if v_bad_card is not null then
    raise exception 'BOSS ROUTES V3 ABORTED: Synchro/Link/Pendulum route card(s): %', v_bad_card;
  end if;

  raise notice 'BOSS ROUTES V3 OK: % active routes, % stages, % grants; % retired route(s) still referenced by a player (deleted by the Season 2 reset)',
    v_active, v_stages, v_grants, (select count(*) from public.boss_routes where not is_active);
end;
$verify$;

commit;
