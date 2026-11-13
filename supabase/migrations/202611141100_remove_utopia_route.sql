-- =========================================================
-- Remove the Utopia Boss Path again (owner decision, 2026-11-14)
--
-- 202611141000 added s2_utopia, but it was meant only as a preview:
-- Samo keeps Ancient Gear. Production was fixed by
-- supabase/manual_deploy/20261114_sam_back_to_ancient_gear.sql (which
-- also moved sam back); this migration keeps a replay of the chain in
-- line with production. The design lives on in
-- docs/BOSS_PATH_PROPOSAL_UTOPIA.md.
--
-- Stages and grants cascade. Refuses while a player holds the route.
-- Safe to run twice.
-- =========================================================

begin;

do $remove$
begin
  if exists (
    select 1
    from public.player_boss_paths p
    join public.boss_routes r on r.id = p.route_id
    where r.code = 's2_utopia'
  ) then
    raise exception 'Utopia removal aborted: a player still holds the Utopia route. Nothing changed - ask Claude.';
  end if;

  delete from public.boss_routes
  where code = 's2_utopia';
end;
$remove$;

commit;
