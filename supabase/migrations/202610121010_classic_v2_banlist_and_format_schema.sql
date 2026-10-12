-- =========================================================
-- 2.0 card pool, part 2: our own banlist in decks + the schema
-- the Classic v2 format needs (curated pool, Boss-route exemption,
-- proposed rarities). Schema and rules only - the DATA (format row,
-- 6,136 pool includes, banlist rows, proposed rarities) is the
-- generated migration 202610121030_classic_v2_format_seed.sql
-- (scripts/cardpool/build-v2-format-migration.mjs).
--
-- 1. duelist_circle_card_limits (format_code, card_catalog_id,
--    max_copies 0..3, source '2014_tcg' | 'proposal', note).
--    Built from data/banlists/tcg-2014-10.json +
--    data/banlists/duelist-circle-proposal.json (a proposal verdict
--    overrides the 2014 status). 0 = forbidden, 1 = limited,
--    2 = semi-limited. A card without a row has no extra limit.
--    'legendary_unique' proposal entries are NOT a deck limit: they
--    are rarity Legendary (1 copy in the whole league via the
--    existing copy limits), so they get no row here.
--
-- 2. Enforcement, as two NEW triggers (the existing
--    validate_deck_card / validate_ready_deck triggers are not
--    touched):
--      - deck_cards BEFORE INSERT/UPDATE -> covers add_card_to_deck
--        (and any other insert path): adding a copy over the limit
--        is refused.
--      - decks BEFORE UPDATE OF status (-> 'ready') -> covers
--        set_deck_status('ready'): a deck that breaks a limit cannot
--        become ready (e.g. a limit tightened after the vote).
--    Limits come from the ACTIVE format only. No active format (=
--    today's live app) -> no limits, so this migration changes
--    nothing for the live main app until Classic v2 is activated
--    on launch night.
--
-- 3. duelist_circle_formats gets two flags:
--      curated_pool_only  - only cards with an 'include' override
--                           are eligible (Classic v2 = exactly the
--                           6,136 playable cards of
--                           data/cardpool/classic-v2-pool.json).
--      boss_route_exempt  - Boss evolution monsters (every stage)
--                           and route-exclusive support grants are
--                           exempt from pool rules and deck limits
--                           (OPEN OWNER QUESTION, docs/cardpool-v2-
--                           ranking.md V1-V6). Not_available and
--                           explicit 'exclude' overrides still win.
--                           Exempt means DECK-LEGAL for whoever owns
--                           the copy (is_duelist_circle_deck_legal,
--                           used by validate_deck_card) - it does NOT
--                           set format_eligible, so draft / shop never
--                           offer an exempt card that is outside the
--                           pool (e.g. a post-2014 stage-2 evolution
--                           like Souleating Oviraptor). Only route
--                           owners get these cards, through the route.
--
-- 4. duelist_circle_proposed_rarities (format_code, card_catalog_id,
--    proposed_rarity, source, rank, note): the ranking-v2 proposal,
--    kept SEPARATE from live card_catalog.game_rarity. Copied into
--    game_rarity only by scripts/season2/reset-and-activate.sql on
--    launch night, after the group vote.
--
-- Additive only: new tables, new columns with defaults, new
-- functions/triggers, plus a redefinition of
-- is_duelist_circle_format_eligible (same signature).
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. Format flags
-- ---------------------------------------------------------

alter table public.duelist_circle_formats
  add column if not exists curated_pool_only boolean not null default false;

comment on column public.duelist_circle_formats.curated_pool_only is
  'true = only cards with a format_card_overrides include row are eligible (an explicit, curated pool). false = the rule-based engine (cutoff/mechanics/stage) decides, includes only add cards.';

alter table public.duelist_circle_formats
  add column if not exists boss_route_exempt boolean not null default false;

comment on column public.duelist_circle_formats.boss_route_exempt is
  'true = Boss evolution monsters (any stage) and route-exclusive support grants are exempt from pool rules and from duelist_circle_card_limits (they are still blocked when not_available in Master Duel or explicitly excluded). Owner decision pending - see docs/LAUNCH_2_0_RUNBOOK.md.';


-- ---------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------

create table if not exists public.duelist_circle_card_limits (
  format_code text not null
    references public.duelist_circle_formats(code)
    on update cascade
    on delete cascade,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete cascade,

  max_copies integer not null,

  source text not null,

  note text,

  created_at timestamptz not null default now(),

  primary key (format_code, card_catalog_id),

  constraint duelist_circle_card_limits_max_copies_range
    check (max_copies between 0 and 3),

  constraint duelist_circle_card_limits_source_check
    check (source in ('2014_tcg', 'proposal'))
);

comment on table public.duelist_circle_card_limits is
  'Our own banlist per format: max copies of a card per deck (0 forbidden, 1 limited, 2 semi-limited). Generated from data/banlists/*.json by scripts/cardpool/build-v2-format-migration.mjs. Enforced for the ACTIVE format by the deck_cards / decks triggers in 202610121010.';

-- PK covers (format_code, card_catalog_id) lookups; the FK to
-- card_catalog gets its own index for cascades.
create index if not exists duelist_circle_card_limits_card_idx
  on public.duelist_circle_card_limits(card_catalog_id);

create table if not exists public.duelist_circle_proposed_rarities (
  format_code text not null
    references public.duelist_circle_formats(code)
    on update cascade
    on delete cascade,

  card_catalog_id uuid not null
    references public.card_catalog(id)
    on delete cascade,

  proposed_rarity text not null,

  source text not null,

  rank integer,

  note text,

  created_at timestamptz not null default now(),

  primary key (format_code, card_catalog_id),

  constraint duelist_circle_proposed_rarities_rarity_check
    check (proposed_rarity in ('Normal', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Legendary'))
);

comment on table public.duelist_circle_proposed_rarities is
  'Proposed game_rarity per card for a format (Classic v2: data/cardpool/ranking-v2.json). Deliberately separate from live card_catalog.game_rarity; copied over only on launch night (scripts/season2/reset-and-activate.sql).';

create index if not exists duelist_circle_proposed_rarities_card_idx
  on public.duelist_circle_proposed_rarities(card_catalog_id);

alter table public.duelist_circle_card_limits enable row level security;
alter table public.duelist_circle_proposed_rarities enable row level security;

drop policy if exists duelist_circle_card_limits_select_authenticated
  on public.duelist_circle_card_limits;

create policy duelist_circle_card_limits_select_authenticated
  on public.duelist_circle_card_limits
  for select
  to authenticated
  using (true);

drop policy if exists duelist_circle_proposed_rarities_select_authenticated
  on public.duelist_circle_proposed_rarities;

create policy duelist_circle_proposed_rarities_select_authenticated
  on public.duelist_circle_proposed_rarities
  for select
  to authenticated
  using (true);

-- Config data: written by migrations / the launch script only.
revoke insert, update, delete on public.duelist_circle_card_limits from anon, authenticated;
revoke insert, update, delete on public.duelist_circle_proposed_rarities from anon, authenticated;
revoke all on public.duelist_circle_card_limits from anon;
revoke all on public.duelist_circle_proposed_rarities from anon;


-- ---------------------------------------------------------
-- 3. Boss-route exemption set
-- ---------------------------------------------------------

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
    where s.evolution_card_catalog_id = target_card_catalog_id
  )
  or exists (
    select 1
    from public.boss_route_stage_grants g
    where g.card_catalog_id = target_card_catalog_id
      and g.is_route_exclusive = true
  );
$$;

comment on function public.is_boss_route_exempt_card(uuid) is
  'Boss evolution monster (any stage) or route-exclusive support grant. These are the cards a format with boss_route_exempt = true exempts from pool rules and deck limits. Wider than is_boss_route_reserved_card() (stage 4 + exclusive grants only), which decides what draft/shop never offer.';

revoke all on function public.is_boss_route_exempt_card(uuid) from public;
grant execute on function public.is_boss_route_exempt_card(uuid) to authenticated;


-- ---------------------------------------------------------
-- 4. Format engine (final 2.0 form; supersedes 202610121000)
-- ---------------------------------------------------------

create or replace function public.is_duelist_circle_format_eligible(
  target_card_catalog_id uuid,
  target_format_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fmt public.duelist_circle_formats;
  card public.card_catalog;
  override public.format_card_overrides;
  is_synchro boolean;
  is_xyz boolean;
  is_link boolean;
  is_pendulum boolean;
  is_fusion boolean;
  is_illusion boolean;
begin
  select * into card from public.card_catalog where id = target_card_catalog_id;
  if card is null then
    return false;
  end if;

  -- Absolute gate (Unlimited rooms): not in Master Duel = never.
  if coalesce(card.master_duel_status, 'unknown') = 'not_available' then
    return false;
  end if;

  if target_format_id is null then
    select * into fmt from public.duelist_circle_formats where is_active = true limit 1;
  else
    select * into fmt from public.duelist_circle_formats where id = target_format_id;
  end if;

  if fmt is null then
    return coalesce(card.format_eligible, false)
      and public.is_master_duel_offerable(card.master_duel_status);
  end if;

  select * into override
  from public.format_card_overrides
  where format_id = fmt.id and card_catalog_id = target_card_catalog_id;

  -- An explicit human exclude always wins.
  if override.id is not null and override.override_type = 'exclude' then
    return false;
  end if;

  -- Curated include = "in our pool", even when the MD status was
  -- never checked.
  if override.id is not null and override.override_type = 'include' then
    return true;
  end if;

  if fmt.curated_pool_only then
    return false;
  end if;

  if not public.is_master_duel_offerable(card.master_duel_status)
    or coalesce(card.master_duel_status, 'unknown') = 'unknown'
  then
    return false;
  end if;

  is_synchro := coalesce(card.card_type, '') ilike '%synchro%' or coalesce(card.frame_type, '') ilike '%synchro%';
  is_xyz := coalesce(card.card_type, '') ilike '%xyz%' or coalesce(card.frame_type, '') ilike '%xyz%';
  is_link := coalesce(card.card_type, '') ilike '%link%' or coalesce(card.frame_type, '') ilike '%link%';
  is_pendulum := coalesce(card.card_type, '') ilike '%pendulum%' or coalesce(card.frame_type, '') ilike '%pendulum%';
  is_fusion := coalesce(card.card_type, '') ilike '%fusion%' or coalesce(card.frame_type, '') ilike '%fusion%';
  is_illusion := coalesce(card.race, '') = 'Illusion' or coalesce(card.monster_type, '') ilike '%illusion%';

  if is_synchro and not fmt.allow_synchro then return false; end if;
  if is_xyz and not fmt.allow_xyz then return false; end if;
  if is_link and not fmt.allow_link then return false; end if;
  if is_pendulum and not fmt.allow_pendulum then return false; end if;
  if is_fusion and not fmt.allow_fusion then return false; end if;
  if is_illusion and not fmt.allow_illusion then return false; end if;

  if fmt.release_cutoff is not null
    and card.release_date is not null
    and card.release_date > fmt.release_cutoff
  then
    return false;
  end if;

  if fmt.power_ceiling is not null
    and card.power_score is not null
    and card.power_score > fmt.power_ceiling
  then
    return false;
  end if;

  if card.release_stage is null or card.release_stage > fmt.current_release_stage then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.is_duelist_circle_format_eligible(uuid, uuid) is
  'Single source of truth for Duelist Circle format eligibility (2.0). Order: not_available in Master Duel -> never; explicit exclude override -> no; include override (curated pool) -> yes; curated_pool_only format -> no; unknown MD status -> no; then mechanics / cutoff / power ceiling / release stage. This decides format_eligible (= what draft/shop may offer); the Boss-route exemption only widens DECK legality, see is_duelist_circle_deck_legal().';

revoke all on function public.is_duelist_circle_format_eligible(uuid, uuid) from public;
grant execute on function public.is_duelist_circle_format_eligible(uuid, uuid) to authenticated;


-- ---------------------------------------------------------
-- 4b. Deck legality = format_eligible, plus the Boss-route
--     exemption when the active format has it on.
-- ---------------------------------------------------------

create or replace function public.is_duelist_circle_deck_legal(
  target_card_catalog_id uuid
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

  return public.is_boss_route_exempt_card(card.id);
end;
$$;

comment on function public.is_duelist_circle_deck_legal(uuid) is
  'May a copy of this card go into a deck? format_eligible, or - when the active format has boss_route_exempt - a Boss evolution monster / route-exclusive grant (never when not_available in Master Duel or explicitly excluded). Used by validate_deck_card. Draft/shop keep using format_eligible, so exempt cards outside the pool are never offered randomly.';

revoke all on function public.is_duelist_circle_deck_legal(uuid) from public;
grant execute on function public.is_duelist_circle_deck_legal(uuid) to authenticated;


-- validate_deck_card (202608190008): identical, except the format
-- check now asks is_duelist_circle_deck_legal() instead of reading
-- card_catalog.format_eligible directly. With no active format (or
-- the exemption off) that function returns format_eligible, so the
-- behaviour is unchanged until launch night.
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

  if not public.is_duelist_circle_deck_legal(target_catalog_id) then
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
-- 5. Deck copy limit lookup
-- ---------------------------------------------------------

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

  if fmt.boss_route_exempt and public.is_boss_route_exempt_card(target_card_catalog_id) then
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
  'Max copies of a card per deck under our own banlist (0/1/2), or null = no extra limit. Default format = the active one; no active format = null (no limits).';

revoke all on function public.duelist_circle_deck_copy_limit(uuid, text) from public;
grant execute on function public.duelist_circle_deck_copy_limit(uuid, text) to authenticated;


-- ---------------------------------------------------------
-- 6. Enforcement triggers
-- ---------------------------------------------------------

create or replace function public.enforce_deck_card_copy_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_catalog_id uuid;
  target_name text;
  copy_limit integer;
  copies_already integer;
begin
  select ci.card_catalog_id, cc.name
  into target_catalog_id, target_name
  from public.card_instances ci
  join public.card_catalog cc on cc.id = ci.card_catalog_id
  where ci.id = new.card_instance_id;

  if target_catalog_id is null then
    -- validate_deck_card reports the missing instance.
    return new;
  end if;

  copy_limit := public.duelist_circle_deck_copy_limit(target_catalog_id);

  if copy_limit is null then
    return new;
  end if;

  if copy_limit = 0 then
    raise exception '% is Forbidden in the Duelist Circle format', target_name;
  end if;

  -- Serialise concurrent adds to the same deck so two parallel
  -- calls cannot both squeeze in under the limit.
  perform 1 from public.decks d where d.id = new.deck_id for update;

  select count(*)
  into copies_already
  from public.deck_cards dc
  join public.card_instances ci on ci.id = dc.card_instance_id
  where dc.deck_id = new.deck_id
    and ci.card_catalog_id = target_catalog_id
    and (tg_op = 'INSERT' or dc.id <> new.id);

  if copies_already + 1 > copy_limit then
    raise exception '% is limited to % per deck in the Duelist Circle format', target_name, copy_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_deck_card_copy_limit_before_write
  on public.deck_cards;

create trigger enforce_deck_card_copy_limit_before_write
before insert or update of card_instance_id, deck_id
on public.deck_cards
for each row
execute function public.enforce_deck_card_copy_limit();


create or replace function public.enforce_ready_deck_copy_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  offender record;
begin
  if new.status <> 'ready' then
    return new;
  end if;

  select cc.name, count(*)::integer as copies, lim.copy_limit
  into offender
  from public.deck_cards dc
  join public.card_instances ci on ci.id = dc.card_instance_id
  join public.card_catalog cc on cc.id = ci.card_catalog_id
  cross join lateral (
    select public.duelist_circle_deck_copy_limit(cc.id) as copy_limit
  ) lim
  where dc.deck_id = new.id
    and lim.copy_limit is not null
  group by cc.id, cc.name, lim.copy_limit
  having count(*) > lim.copy_limit
  order by cc.name
  limit 1;

  if found then
    if offender.copy_limit = 0 then
      raise exception '% is Forbidden in the Duelist Circle format - remove it before marking the deck ready', offender.name;
    end if;

    raise exception '% is limited to % per deck in the Duelist Circle format (deck has %)',
      offender.name, offender.copy_limit, offender.copies;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_ready_deck_copy_limits_before_update
  on public.decks;

create trigger enforce_ready_deck_copy_limits_before_update
before update of status
on public.decks
for each row
execute function public.enforce_ready_deck_copy_limits();

commit;
