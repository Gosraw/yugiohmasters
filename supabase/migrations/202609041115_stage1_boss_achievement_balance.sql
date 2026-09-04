begin;

-- =========================================================
-- Stage 1 -> Stage 2 Boss Path achievement rebalance
--
-- Scope is deliberately limited to these three routes:
--   dark_magician
--   cyber_dragon
--   armed_dragon_ojama
--
-- Later-stage requirements (Stage 2 -> 3 and Stage 3 -> 4) are
-- intentionally untouched. The Boss achievement log can award a given
-- event at most once per match, so a target of 6 means six confirmed
-- duels in which the event happened, not six occurrences inside one duel.
-- =========================================================

-- -------------------------
-- 1. Add/update Stage-1 event definitions
-- -------------------------

-- Magicians
insert into public.boss_route_achievement_events
  (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'stage1_summon', 'Summon een Magician Girl',
       'Bevestig dit maximaal 1 keer per duel als de speler minstens 1 Magician Girl heeft gesummond.', false
from public.boss_routes r
where r.code = 'dark_magician'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events
  (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'stage1_effect', 'Gebruik een Magician Girl-effect',
       'Bevestig dit maximaal 1 keer per duel als de speler minstens 1 effect van een Magician Girl heeft gebruikt.', false
from public.boss_routes r
where r.code = 'dark_magician'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events
  (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'stage1_win', 'Win met een Magician Girl in je deck',
       'Bevestig dit als de speler het duel won met minstens 1 Magician Girl in het gebruikte deck.', false
from public.boss_routes r
where r.code = 'dark_magician'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

-- Cyber Dragon
insert into public.boss_route_achievement_events
  (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'stage1_summon', 'Summon een Cyber Dragon-monster',
       'Bevestig dit maximaal 1 keer per duel als de speler minstens 1 Cyber Dragon-monster heeft gesummond.', false
from public.boss_routes r
where r.code = 'cyber_dragon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events
  (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'stage1_support', 'Gebruik een Cyber Spell/Trap',
       'Bevestig dit maximaal 1 keer per duel als de speler minstens 1 Cyber-gerelateerde Spell of Trap heeft geactiveerd.', false
from public.boss_routes r
where r.code = 'cyber_dragon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events
  (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'stage1_win', 'Win met een Cyber Dragon-kaart in je deck',
       'Bevestig dit als de speler het duel won met minstens 1 Cyber Dragon-kaart in het gebruikte deck.', false
from public.boss_routes r
where r.code = 'cyber_dragon'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

-- Chazz / Armed Dragon
insert into public.boss_route_achievement_events
  (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'stage1_summon', 'Summon Armed Dragon LV3',
       'Bevestig dit maximaal 1 keer per duel als Armed Dragon LV3 is gesummond.', false
from public.boss_routes r
where r.code = 'armed_dragon_ojama'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events
  (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'stage1_support', 'Gebruik een Armed Dragon Spell/Trap',
       'Bevestig dit maximaal 1 keer per duel als de speler minstens 1 Armed Dragon Spell of Trap heeft geactiveerd.', false
from public.boss_routes r
where r.code = 'armed_dragon_ojama'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

insert into public.boss_route_achievement_events
  (route_id, event_key, label, description, is_finishing_blow)
select r.id, 'stage1_win', 'Win met Armed Dragon LV3 in je deck',
       'Bevestig dit als de speler het duel won met Armed Dragon LV3 in het gebruikte deck.', false
from public.boss_routes r
where r.code = 'armed_dragon_ojama'
on conflict (route_id, event_key) do update set
  label = excluded.label,
  description = excluded.description,
  is_finishing_blow = excluded.is_finishing_blow;

-- -------------------------
-- 2. Replace ONLY Stage 2 requirements for these routes
-- -------------------------

delete from public.boss_route_achievement_requirements req
using public.boss_route_stages s, public.boss_routes r
where req.target_stage_id = s.id
  and s.route_id = r.id
  and s.stage_number = 2
  and r.code in ('dark_magician', 'cyber_dragon', 'armed_dragon_ojama');

-- Magicians: summon 6 / effect 6 / win 3
insert into public.boss_route_achievement_requirements
  (target_stage_id, event_id, target_count)
select s.id, e.id, v.target_count
from public.boss_routes r
join public.boss_route_stages s
  on s.route_id = r.id and s.stage_number = 2
join public.boss_route_achievement_events e
  on e.route_id = r.id
join (values
  ('stage1_summon'::text, 6),
  ('stage1_effect'::text, 6),
  ('stage1_win'::text, 3)
) as v(event_key, target_count)
  on v.event_key = e.event_key
where r.code = 'dark_magician'
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- Cyber Dragon: summon 6 / support 4 / win 3
insert into public.boss_route_achievement_requirements
  (target_stage_id, event_id, target_count)
select s.id, e.id, v.target_count
from public.boss_routes r
join public.boss_route_stages s
  on s.route_id = r.id and s.stage_number = 2
join public.boss_route_achievement_events e
  on e.route_id = r.id
join (values
  ('stage1_summon'::text, 6),
  ('stage1_support'::text, 4),
  ('stage1_win'::text, 3)
) as v(event_key, target_count)
  on v.event_key = e.event_key
where r.code = 'cyber_dragon'
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- Chazz: summon LV3 6 / support 4 / win 3
insert into public.boss_route_achievement_requirements
  (target_stage_id, event_id, target_count)
select s.id, e.id, v.target_count
from public.boss_routes r
join public.boss_route_stages s
  on s.route_id = r.id and s.stage_number = 2
join public.boss_route_achievement_events e
  on e.route_id = r.id
join (values
  ('stage1_summon'::text, 6),
  ('stage1_support'::text, 4),
  ('stage1_win'::text, 3)
) as v(event_key, target_count)
  on v.event_key = e.event_key
where r.code = 'armed_dragon_ojama'
on conflict (target_stage_id, event_id) do update set
  target_count = excluded.target_count;

-- -------------------------
-- 3. Safety verification
-- -------------------------

do $verify$
declare
  v_stage2_rows integer;
  v_later_rows integer;
begin
  select count(*)
    into v_stage2_rows
  from public.boss_route_achievement_requirements req
  join public.boss_route_stages s on s.id = req.target_stage_id
  join public.boss_routes r on r.id = s.route_id
  where s.stage_number = 2
    and r.code in ('dark_magician', 'cyber_dragon', 'armed_dragon_ojama');

  if v_stage2_rows <> 9 then
    raise exception 'Stage 1 achievement rebalance aborted: expected 9 Stage-2 requirement rows, found %.', v_stage2_rows;
  end if;

  -- We do not alter Stage 3/4 requirement rows in this migration.
  select count(*)
    into v_later_rows
  from public.boss_route_achievement_requirements req
  join public.boss_route_stages s on s.id = req.target_stage_id
  join public.boss_routes r on r.id = s.route_id
  where s.stage_number in (3, 4)
    and r.code in ('dark_magician', 'cyber_dragon', 'armed_dragon_ojama');

  if v_later_rows = 0 then
    raise exception 'Stage 1 achievement rebalance aborted: later-stage requirements unexpectedly missing.';
  end if;
end
$verify$;

commit;

-- Read-only verification output for Supabase SQL Editor.
select
  r.code as route,
  s.stage_number as target_stage,
  e.event_key,
  e.label,
  req.target_count
from public.boss_route_achievement_requirements req
join public.boss_route_stages s on s.id = req.target_stage_id
join public.boss_routes r on r.id = s.route_id
join public.boss_route_achievement_events e on e.id = req.event_id
where r.code in ('dark_magician', 'cyber_dragon', 'armed_dragon_ojama')
  and s.stage_number = 2
order by r.code, e.event_key;
