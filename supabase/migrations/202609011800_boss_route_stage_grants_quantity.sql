-- =========================================================
-- BOSS ROUTE STAGE GRANTS: QUANTITY COLUMN
--
-- The Toon Route's Stage 1 grant includes 2 copies of Toon World -
-- an explicitly approved design decision from an earlier sprint
-- ("2 copies of Toon World at Stage 1 is an existing approved
-- decision"). The original boss_route_stage_grants table
-- (202609011600_boss_route_schema.sql) has a unique(stage_id,
-- card_catalog_id) constraint, so a second copy of the same card at
-- the same stage needs a quantity column rather than a second row.
-- =========================================================

begin;

alter table public.boss_route_stage_grants
add column if not exists quantity integer
not null
default 1;

alter table public.boss_route_stage_grants
drop constraint if exists boss_route_stage_grants_quantity_positive;

alter table public.boss_route_stage_grants
add constraint boss_route_stage_grants_quantity_positive
check (
  quantity > 0
);

do $verify$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'boss_route_stage_grants'
      and column_name = 'quantity'
  ) then
    raise exception
      'BOSS ROUTE QUANTITY MIGRATION ABORTED: boss_route_stage_grants.quantity was not created.';
  end if;

  raise notice 'BOSS ROUTE QUANTITY MIGRATION: quantity column verified.';
end $verify$;

commit;
