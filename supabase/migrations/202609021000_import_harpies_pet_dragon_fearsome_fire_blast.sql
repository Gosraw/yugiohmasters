begin;

-- =========================================================
-- IMPORT: Harpie's Pet Dragon - Fearsome Fire Blast (Season 1
-- audit - Harpie route Stage 4, RESOLVED this round)
--
-- WHY
-- The Harpie route's final Stage 4 card really is this card - a
-- real, official Yu-Gi-Oh card (Dragon/Effect, WIND, Level 7,
-- 2000/2500 ATK/DEF, archetype "Harpie") - confirmed against
-- multiple independent card-database sources (Yugipedia,
-- YGOPRODeck, and Konami's own official Yu-Gi-Oh! Neuron database),
-- not against this app's local card-valuation snapshot, which does
-- NOT contain it. The problem was always that this specific card
-- had never been imported into this app's card_catalog, not that
-- the spec'd name was wrong or fictional - so per the "Stage 4 Boss
-- cards are explicitly allowed to be newer than the normal cardpool
-- cutoff" rule, it is imported here directly as a Boss-Route-only
-- card, rather than substituting the plain, older "Harpie's Pet
-- Dragon" (a different, non-equivalent real card).
--
-- Verified real metadata (OCG release 2021-05-21, TCG release
-- 2022-07-21; confirmed obtainable in Yu-Gi-Oh Master Duel at Super
-- Rare from the "Cosmic Ocean"/"Glory on Wings" secret packs, so
-- master_duel_status = 'unlimited' is accurate, not a guess):
--   Card type   : Effect Monster
--   Attribute   : WIND
--   Type/Race   : Dragon
--   Level       : 7
--   ATK / DEF   : 2000 / 2500
--   Archetype   : Harpie
--   Effect      : "Monsters cannot target Level 6 or lower 'Harpie'
--                 monsters for attacks. You can only use each of the
--                 following effects of this card once per turn. If
--                 you control a Level 6 or lower WIND monster: You
--                 can Special Summon this card from your hand in
--                 Defense Position. If this card is sent from the
--                 field to the GY: You can send 1 WIND Winged Beast
--                 monster from your Deck to the GY."
--   Printings   : Legendary Duelists: Season 3 (LDS3-EN138),
--                 Speed Duel: Battle City Finals (SBC2-ENH01) -
--                 among others; not an exhaustive print list.
--
-- external_card_id: RESOLVED, real passcode confirmed
-- Real passcode 04991081 (stored as bigint 4991081 - no leading
-- zero, matching this app's existing external_card_id convention
-- for every other card_catalog row). Independently re-confirmed
-- this round against YGOPRODeck's own card page (which surfaces the
-- passcode field directly) and cross-checked against Konami's
-- Yu-Gi-Oh! Neuron database entry (cid=16622), which matches this
-- card's name and full metadata exactly. The out-of-range 9-digit
-- placeholder used in the prior round has been fully replaced with
-- this real, verified value - no placeholder remains anywhere in
-- this migration.
--
-- format_eligible = false, with format_exclusion_reason set
-- (matching the existing Synchro-exclusion pattern in
-- 202608190005_draft_system.sql): this card is a 2021/2022 release,
-- after this format's normal era cutoff, so it would never earn
-- format_eligible = true through the ordinary recompute rule -
-- exactly the "newer than the normal cardpool cutoff" case the go-
-- live spec calls out. This is on top of, not instead of, the
-- existing Stage-4-evolution-monster exclusion already enforced in
-- Draft/Shop/Special Pack pulls (202609020930/202609020950/202609020970) -
-- belt and suspenders, not a replacement for that mechanism.
--
-- SAFETY
-- Single INSERT, guarded by NOT EXISTS on the exact name, so
-- re-running this migration after it has already succeeded is a
-- no-op rather than a duplicate-row error (external_card_id's own
-- UNIQUE constraint would also catch a re-run, but the NOT EXISTS
-- guard makes the intent explicit and keeps this migration safe to
-- re-run even if a human later corrects external_card_id in place).
-- =========================================================

insert into public.card_catalog (
  external_card_id,
  name,
  card_type,
  frame_type,
  monster_type,
  race,
  attribute,
  level,
  atk,
  def,
  description,
  archetype,
  set_information,
  source,
  format_eligible,
  format_exclusion_reason,
  game_rarity,
  rarity_needs_review,
  rarity_reason
)
select
  4991081,
  'Harpie''s Pet Dragon - Fearsome Fire Blast',
  'Effect Monster',
  'effect',
  'Dragon / Effect',
  'Dragon',
  'WIND',
  7,
  2000,
  2500,
  'Monsters cannot target Level 6 or lower "Harpie" monsters for attacks. You can only use each of the following effects of "Harpie''s Pet Dragon - Fearsome Fire Blast" once per turn. If you control a Level 6 or lower WIND monster: You can Special Summon this card from your hand in Defense Position. If this card is sent from the field to the GY: You can send 1 WIND Winged Beast monster from your Deck to the GY.',
  'Harpie',
  '[{"set_name": "Legendary Duelists: Season 3", "set_code": "LDS3-EN138"}, {"set_name": "Speed Duel: Battle City Finals", "set_code": "SBC2-ENH01"}]'::jsonb,
  'manual_import_verified',
  false,
  'Boss Route (Harpie) Stage 4 exclusive card - 2021/2022 release, after this format''s normal era cutoff; available only through boss_route_stages, never through Draft/Shop/Special Packs.',
  null,
  false,
  'Boss-Route-exclusive Stage 4 card - never enters the normal pack/draft rarity pool, so this app''s Duelist Circle rarity calibration does not apply and no review is needed.'
where not exists (
  select 1 from public.card_catalog
  where name = 'Harpie''s Pet Dragon - Fearsome Fire Blast'
);

do $verify$
declare
  v_id uuid;
  v_format_eligible boolean;
  v_external_card_id bigint;
begin
  select id, format_eligible, external_card_id
  into v_id, v_format_eligible, v_external_card_id
  from public.card_catalog
  where name = 'Harpie''s Pet Dragon - Fearsome Fire Blast';

  if v_id is null then
    raise exception
      'HARPIE CARD IMPORT ABORTED: Harpie''s Pet Dragon - Fearsome Fire Blast was not found in card_catalog after insert.';
  end if;

  if v_format_eligible is distinct from false then
    raise exception
      'HARPIE CARD IMPORT ABORTED: format_eligible is not false for the imported card - it would leak into normal Draft/Shop/Special Pack pulls.';
  end if;

  if v_external_card_id is distinct from 4991081 then
    raise exception
      'HARPIE CARD IMPORT ABORTED: external_card_id is % , expected the real verified passcode 4991081.', v_external_card_id;
  end if;

  raise notice 'HARPIE CARD IMPORT: Harpie''s Pet Dragon - Fearsome Fire Blast now exists in card_catalog (id %), format_eligible = false, external_card_id = 4991081 (real, verified passcode - no placeholder remains).', v_id;
end $verify$;

commit;
