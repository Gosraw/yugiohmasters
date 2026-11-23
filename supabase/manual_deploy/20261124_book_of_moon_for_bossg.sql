-- =========================================================
-- PASTE INTO THE SUPABASE SQL EDITOR (production), 2026-11-24
--
-- Owner request: bossg's NEXT Standard Pack contains Book of Moon.
--
-- Part 1 = migration 202611241000_shop_pack_forced_card.sql (copied
-- unchanged): the shop_pack_forced_cards table + the thin wrapper
-- around the pack picker. purchase_shop_pack itself is not touched.
-- Part 2 = the one row for bossg.
--
-- Book of Moon takes the first ordinary slot; the pack's best card
-- stays. The Standard Pack from a round-reward voucher counts too.
-- If the league already holds the maximum number of Book of Moon
-- copies, the pack is normal and the row stays waiting.
-- Safe to run twice (no second row while one is still waiting).
-- The last row must say checks_passed = true.
-- =========================================================

begin;

-- =========================================================
-- Forced card in a player's next pack (2026-11-24)
--
-- Owner request: "give bossg a Book of Moon in his next Standard
-- Pack". There was no way to do that (the old hand-made
-- next_pack_overrides / forced_next_pack_card tables were dropped
-- in 202610115900_prod_drift_normalize.sql).
--
-- public.shop_pack_forced_cards: one row = "the next <pack_code>
-- pack this player opens contains this card". Only the owner adds
-- rows (SQL editor); players cannot read or write the table.
--
-- How it reaches the pack WITHOUT touching purchase_shop_pack (the
-- fragile one, see CLAUDE.md): the internal picker
-- _pick_shop_pack_card_constrained is renamed to
-- _pick_shop_pack_card_base (body unchanged), and a thin wrapper
-- with the old name and the exact same arguments takes its place.
-- purchase_shop_pack calls the picker once per slot, the peak
-- (best) slot first, so the wrapper puts the forced card in the
-- SECOND pick = the first ordinary slot: the player keeps the
-- pack's best card. Everything else goes straight to the base
-- picker, unchanged.
--
-- The wrapper only fires when:
--   * it is not a Special Pack (target_rotation_id is null),
--   * the pack being opened (this player's opening with exactly one
--     pull so far - purchase_shop_pack inserts the opening before
--     the card loop and the peak card first) has the row's
--     pack_code,
--   * the card is still under its league-wide copy limit (else the
--     row stays open and the pack is normal; validate_new_card_
--     instance would refuse it anyway).
-- The row is then marked used (used_at + used_opening_id) in the
-- same transaction as the purchase: a failed purchase rolls it back.
--
-- If a later migration re-creates _pick_shop_pack_card_constrained
-- with a full body, this wrapper is simply replaced (forced cards
-- stop working, nothing breaks) and _pick_shop_pack_card_base stays
-- behind unused.
-- =========================================================

create table if not exists public.shop_pack_forced_cards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pack_code text not null check (pack_code in ('normal', 'premium', 'deluxe')),
  card_catalog_id uuid not null references public.card_catalog(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_opening_id uuid references public.shop_pack_openings(id) on delete set null
);

create index if not exists shop_pack_forced_cards_open_idx
  on public.shop_pack_forced_cards (profile_id, pack_code, created_at)
  where used_at is null;

alter table public.shop_pack_forced_cards enable row level security;

revoke all on table public.shop_pack_forced_cards from public, anon, authenticated;

comment on table public.shop_pack_forced_cards is
  'Owner-only: the next pack of pack_code this player opens contains card_catalog_id (first ordinary slot). Used by _pick_shop_pack_card_constrained (202611241000).';

-- Rename the real picker once (re-running skips this).
do $$
begin
  if to_regprocedure('public._pick_shop_pack_card_base(uuid, text, uuid, text[], uuid[])') is null then
    alter function public._pick_shop_pack_card_constrained(uuid, text, uuid, text[], uuid[])
      rename to _pick_shop_pack_card_base;
  end if;
end;
$$;

revoke all on function public._pick_shop_pack_card_base(uuid, text, uuid, text[], uuid[])
  from public, anon, authenticated;

create or replace function public._pick_shop_pack_card_constrained(
  target_profile_id uuid,
  target_rarity text,
  target_rotation_id uuid default null,
  capped_archetypes text[] default '{}',
  pack_card_ids uuid[] default '{}'
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  newest_opening public.shop_pack_openings%rowtype;
  forced_row public.shop_pack_forced_cards%rowtype;
  forced_rarity text;
  league_copies integer;
begin
  if target_rotation_id is null
     and cardinality(pack_card_ids) = 1 then
    -- The pack being opened right now: this player's opening that
    -- holds exactly one pull so far (the peak slot just inserted;
    -- pack_card_ids has that one card). Finished packs hold 5+.
    select o.*
    into newest_opening
    from public.shop_pack_openings o
    where o.profile_id = target_profile_id
      and (
        select count(*)
        from public.shop_pack_pulls pp
        where pp.opening_id = o.id
      ) = 1
      and exists (
        select 1
        from public.shop_pack_pulls pp
        where pp.opening_id = o.id
          and pp.card_catalog_id = pack_card_ids[1]
      )
    order by o.opened_at desc
    limit 1;

    if found then
      select f.*
      into forced_row
      from public.shop_pack_forced_cards f
      where f.profile_id = target_profile_id
        and f.pack_code = newest_opening.pack_code
        and f.used_at is null
      order by f.created_at
      limit 1
      for update;

      if found and forced_row.card_catalog_id <> all (pack_card_ids) then
        select card.game_rarity
        into forced_rarity
        from public.card_catalog card
        where card.id = forced_row.card_catalog_id;

        select count(*)
        into league_copies
        from public.card_instances instance
        where instance.card_catalog_id = forced_row.card_catalog_id
          and instance.league_id = (
            select lm.league_id
            from public.league_members lm
            where lm.profile_id = target_profile_id
            limit 1
          );

        if forced_rarity is not null
           and league_copies < public.shop_card_copy_limit(forced_rarity) then
          update public.shop_pack_forced_cards
          set
            used_at = now(),
            used_opening_id = newest_opening.id
          where id = forced_row.id;

          return forced_row.card_catalog_id;
        end if;
      end if;
    end if;
  end if;

  return public._pick_shop_pack_card_base(
    target_profile_id,
    target_rarity,
    target_rotation_id,
    capped_archetypes,
    pack_card_ids
  );
end;
$function$;

revoke all on function public._pick_shop_pack_card_constrained(uuid, text, uuid, text[], uuid[])
  from public, anon, authenticated;

commit;

-- =========================================================
-- Part 2: Book of Moon in bossg's next Standard Pack
-- =========================================================

begin;

insert into public.shop_pack_forced_cards (
  profile_id,
  pack_code,
  card_catalog_id,
  note
)
select
  p.id,
  'normal',
  c.id,
  'Owner request 2026-11-24: Book of Moon in the next Standard Pack'
from public.profiles p
cross join public.card_catalog c
where p.username = 'bossg'
  and c.external_card_id = 14087893
  and not exists (
    select 1
    from public.shop_pack_forced_cards f
    where f.profile_id = p.id
      and f.pack_code = 'normal'
      and f.card_catalog_id = c.id
      and f.used_at is null
  );

-- The API caches the list of database functions.
notify pgrst, 'reload schema';

commit;

-- =========================================================
-- VERIFICATION (reads only)
-- =========================================================

select
  (
    select count(*)
    from public.shop_pack_forced_cards f
    join public.profiles p on p.id = f.profile_id
    join public.card_catalog c on c.id = f.card_catalog_id
    where p.username = 'bossg'
      and c.name = 'Book of Moon'
      and f.pack_code = 'normal'
      and f.used_at is null
  ) as waiting_for_next_standard_pack,
  (
    select count(*)
    from public.card_instances ci
    join public.card_catalog c on c.id = ci.card_catalog_id
    where c.external_card_id = 14087893
  ) as book_of_moon_copies_in_league,
  (
    select public.shop_card_copy_limit(c.game_rarity)
    from public.card_catalog c
    where c.external_card_id = 14087893
  ) as copy_limit,
  (
    to_regprocedure('public._pick_shop_pack_card_base(uuid, text, uuid, text[], uuid[])') is not null
    and to_regprocedure('public._pick_shop_pack_card_constrained(uuid, text, uuid, text[], uuid[])') is not null
    and not has_function_privilege('authenticated', 'public._pick_shop_pack_card_constrained(uuid, text, uuid, text[], uuid[])', 'execute')
    and (
      select count(*)
      from public.shop_pack_forced_cards f
      join public.profiles p on p.id = f.profile_id
      where p.username = 'bossg'
        and f.pack_code = 'normal'
        and f.used_at is null
    ) = 1
  ) as checks_passed;
