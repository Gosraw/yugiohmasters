// =========================================================
// SYNERGY ENGINE REGRESSION SUITE
//
// Plain node:assert/strict harness - NOT vitest, same reason as
// valuation-engine.regression.test.mjs (npx vitest is broken on the
// device bridge - missing @rollup/rollup-linux-arm64-gnu). Run with
// plain `node lib/synergy-engine.regression.test.mjs`.
//
// WHAT THIS SUITE EXISTS TO PROVE
// The product requirement (Part L) is explicit: a synergy engine
// that would call two cards "synergistic" merely because they share
// an archetype, an Attribute, or a keyword like "send to Graveyard"
// is NOT good enough and must be provably rejected by tests, not
// just avoided by convention. Every fixture below is SYNTHETIC
// (invented card names/text, not real TCG cards) - unlike the
// valuation-engine suite, this one is not trying to validate against
// remembered real-card behavior, it is trying to isolate one
// structural relationship (or deliberately its ABSENCE) per test, so
// synthetic, minimal, unambiguous text is the more honest choice
// here, not a shortcut.
// =========================================================

import assert from "node:assert/strict";
import {
  computeCardMechanics,
  computeSynergyEdges,
  MECHANIC_TAGS,
  SYNERGY_ENGINE_VERSION,
} from "./synergy-engine.mjs";

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function edgesBetween(cardA, cardB) {
  const mechA = computeCardMechanics(cardA);
  const mechB = computeCardMechanics(cardB);
  return computeSynergyEdges(cardA, mechA, cardB, mechB);
}

function edgesOfType(edges, type) {
  return edges.filter((e) => e.edgeType === type);
}

// ---------------------------------------------------------
// Fixtures - one relationship isolated per pair
// ---------------------------------------------------------

const monster = (overrides) => ({
  id: overrides.id,
  name: overrides.name,
  card_type: "Effect Monster",
  frame_type: "effect",
  attribute: "DARK",
  monster_type: "Spellcaster",
  level: 4,
  atk: 1800,
  def: 1200,
  archetype: null,
  description: "",
  ...overrides,
});

const spellTrap = (overrides) => ({
  id: overrides.id,
  name: overrides.name,
  card_type: overrides.card_type ?? "Spell Card",
  frame_type: overrides.frame_type ?? "spell",
  attribute: null,
  monster_type: null,
  level: null,
  atk: null,
  def: null,
  archetype: null,
  description: "",
  ...overrides,
});

// --- 1. NAMED SEARCH (searches) ---
const SEARCHER = monster({
  id: "searcher",
  name: "Arcane Cataloguer",
  archetype: "Arcanum",
  description:
    'When this card is Normal Summoned: You can add 1 "Arcanum Grimoire" from your Deck to your hand.',
});
const SEARCH_TARGET = monster({
  id: "target",
  name: "Arcanum Grimoire",
  archetype: "Arcanum",
  description: "You can banish this card from your Graveyard; draw 1 card.",
});

// --- 2. SELF-REFERENCE must not become a search edge to itself ---
const SELF_REF_STARTER = monster({
  id: "self-ref",
  name: "Lone Vigil Sentinel",
  archetype: null,
  description:
    "If this card is Normal Summoned: You can add 1 copy of this card from your Deck to your hand.",
});

// --- 3. NAMED EXTRA DECK MATERIAL (material_supply_named) ---
const NAMED_MATERIAL_TARGET = monster({
  id: "named-mat",
  name: "Ember Wisp",
  attribute: "FIRE",
  monster_type: "Pyro",
  description: "FLIP: Inflict 300 damage to your opponent.",
});
const FUSION_NEEDING_NAMED = {
  id: "fusion-named",
  name: "Cinder Colossus",
  card_type: "Fusion Monster",
  frame_type: "fusion",
  attribute: "FIRE",
  monster_type: "Pyro",
  level: 8,
  atk: 3000,
  def: 2500,
  archetype: null,
  description:
    '"Ember Wisp" + 1 FIRE monster\nMust be Fusion Summoned. Cannot be destroyed by battle.',
};

// --- 4. CONSTRAINED (not named) EXTRA DECK MATERIAL ---
const CONSTRAINED_MATERIAL_CANDIDATE = monster({
  id: "constrained-cand",
  name: "Wind Acolyte",
  attribute: "WIND",
  monster_type: "Spellcaster",
  description: "You can Tribute this card; draw 1 card.",
});
const XYZ_NEEDING_CONSTRAINED = {
  id: "xyz-constrained",
  name: "Gale Sovereign",
  card_type: "XYZ Monster",
  frame_type: "xyz",
  attribute: "WIND",
  monster_type: "Spellcaster",
  rank: 4,
  atk: 2400,
  def: 2000,
  archetype: null,
  description: "2 WIND monsters\nDetach 1 material: Destroy 1 card your opponent controls.",
};

// --- 5. NAMED NON-MATERIAL REQUIREMENT (requirement_satisfies) ---
// Uses the real, narrow oracle-text convention classifyReference()
// actually recognizes ("you can only activate this card if you
// control <Name>") rather than an invented phrasing - a synthetic
// fixture testing a real classifier must still speak its language.
const NAMED_REQUIREMENT_TARGET = monster({
  id: "req-target",
  name: "Hollow Effigy",
  description: "You can banish this card from your Graveyard; Set 1 Trap Card from your hand.",
});
const CARD_WITH_NAMED_REQUIREMENT = spellTrap({
  id: "req-user",
  name: "Effigy's Bargain",
  card_type: "Trap Card",
  frame_type: "trap",
  description:
    'You can only activate this card if you control "Hollow Effigy". Draw 2 cards.',
});

// --- 6. GY SETUP -> GY PAYOFF (gy_setup_for) ---
const GY_SETUP_CARD = spellTrap({
  id: "gy-setup",
  name: "Discard Draft",
  description: "Send 1 card from your hand to the Graveyard; draw 1 card.",
});
const GY_PAYOFF_CARD = monster({
  id: "gy-payoff",
  name: "Grave Whisperer",
  description: "If this card is in your Graveyard: You can banish it to add 1 card to your hand.",
});

// --- 7. DISCARD OUTLET -> GY PAYOFF (discard_payoff_for) ---
const DISCARD_OUTLET_CARD = spellTrap({
  id: "discard-outlet",
  name: "Forced Exchange",
  description: "Discard 1 card, then draw 1 card.",
});

// --- 8. BANISH SETUP -> BANISH PAYOFF (banish_payoff_for) ---
const BANISH_SETUP_CARD = monster({
  id: "banish-setup",
  name: "Rift Stalker",
  description: "You can banish 1 card from your hand; this card gains 500 ATK.",
});
const BANISH_PAYOFF_CARD = monster({
  id: "banish-payoff",
  name: "Void Reclaimer",
  description:
    "If a card you control is banished: You can Special Summon this card from your hand.",
});

// --- 9. FUNCTIONAL ARCHETYPE SUPPORT (spell_trap_support) ---
const ARCANUM_SUPPORT_SPELL = spellTrap({
  id: "arcanum-support",
  name: "Arcanum Rally",
  description: 'Add 1 "Arcanum" monster from your Deck to your hand.',
});

// --- 10. THEMATIC-ONLY ARCHETYPE NAME (should NOT create spell_trap_support) ---
const THEMATIC_ONLY_TRAP = spellTrap({
  id: "thematic-only",
  name: "Arcanum's Judgment",
  card_type: "Trap Card",
  frame_type: "trap",
  description: "Destroy 1 monster your opponent controls.",
});

// --- 11/12/13. SAME-ARCHETYPE-ALONE / SAME-ATTRIBUTE-ALONE / KEYWORD-
// OVERLAP-ALONE must not create ANY edge ---
const UNRELATED_A = monster({
  id: "unrelated-a",
  name: "Ridge Wanderer",
  archetype: "Shared Arch",
  attribute: "EARTH",
  description: "This card gains 200 ATK for each monster you control.",
});
const UNRELATED_B = monster({
  id: "unrelated-b",
  name: "Canyon Drifter",
  archetype: "Shared Arch",
  attribute: "EARTH",
  description: "This card cannot be destroyed by battle with an EARTH monster.",
});

// Both mention "Graveyard" and "send" but have no real structural
// relation to EACH OTHER (A sends ITSELF, B has no payoff at all).
const KEYWORD_OVERLAP_A = monster({
  id: "keyword-a",
  name: "Ashfall Duelist",
  description: "Once per turn: You can send this card from your hand to the Graveyard.",
});
const KEYWORD_OVERLAP_B = monster({
  id: "keyword-b",
  name: "Cinder Herald",
  description: "Once per turn: You can send 1 card from your hand to the Graveyard.",
});

// ---------------------------------------------------------
// Tests
// ---------------------------------------------------------

console.log(`\nSynergy engine version under test: ${SYNERGY_ENGINE_VERSION}\n`);

test("MECHANIC_TAGS covers the full requested taxonomy (>= 38 tags)", () => {
  assert.ok(MECHANIC_TAGS.length >= 38, `expected >= 38 tags, got ${MECHANIC_TAGS.length}`);
  assert.ok(new Set(MECHANIC_TAGS).size === MECHANIC_TAGS.length, "tag list must have no duplicates");
});

test("named search target produces a high-confidence 'searches' edge", () => {
  const edges = edgesBetween(SEARCHER, SEARCH_TARGET);
  const searches = edgesOfType(edges, "searches");
  assert.equal(searches.length, 1);
  assert.equal(searches[0].sourceCardId, "searcher");
  assert.equal(searches[0].targetCardId, "target");
  assert.equal(searches[0].confidence, "high");
  assert.ok(searches[0].deterministicReason.includes("Arcanum Grimoire"));
});

test("self-referential search text does not produce a searches edge to another card", () => {
  const mech = computeCardMechanics(SELF_REF_STARTER);
  // "add 1 copy of this card" must classify as self_reference, not a
  // named search_target - so searchTargets must not contain its own
  // name (which would otherwise let ANY other card holding this name
  // falsely match).
  assert.ok(
    !mech.searchTargets.includes(SELF_REF_STARTER.name.toLowerCase()),
    `searchTargets incorrectly contains self-reference: ${JSON.stringify(mech.searchTargets)}`
  );
});

test("named Extra Deck material produces a high-confidence 'material_supply_named' edge, direction = material -> Extra Deck card", () => {
  const edges = edgesBetween(FUSION_NEEDING_NAMED, NAMED_MATERIAL_TARGET);
  const named = edgesOfType(edges, "material_supply_named");
  assert.equal(named.length, 1);
  assert.equal(named[0].sourceCardId, "named-mat");
  assert.equal(named[0].targetCardId, "fusion-named");
  assert.equal(named[0].confidence, "high");
});

test("constrained (Attribute/Type) Extra Deck material produces a medium-confidence 'material_supply_constrained' edge, not 'material_supply_named'", () => {
  const edges = edgesBetween(XYZ_NEEDING_CONSTRAINED, CONSTRAINED_MATERIAL_CANDIDATE);
  const constrained = edgesOfType(edges, "material_supply_constrained");
  const named = edgesOfType(edges, "material_supply_named");
  assert.equal(named.length, 0, "a generic/constrained requirement must never produce a NAMED edge");
  assert.equal(constrained.length, 1);
  assert.equal(constrained[0].confidence, "medium");
  assert.equal(constrained[0].sourceCardId, "constrained-cand");
  assert.equal(constrained[0].targetCardId, "xyz-constrained");
});

test("named non-material mandatory requirement produces a high-confidence 'requirement_satisfies' edge", () => {
  const edges = edgesBetween(CARD_WITH_NAMED_REQUIREMENT, NAMED_REQUIREMENT_TARGET);
  const req = edgesOfType(edges, "requirement_satisfies");
  assert.equal(req.length, 1);
  assert.equal(req[0].sourceCardId, "req-target");
  assert.equal(req[0].targetCardId, "req-user");
  assert.equal(req[0].confidence, "high");
});

test("GY setup -> GY payoff produces a medium-confidence 'gy_setup_for' edge", () => {
  const mechSetup = computeCardMechanics(GY_SETUP_CARD);
  const mechPayoff = computeCardMechanics(GY_PAYOFF_CARD);
  assert.ok(mechSetup.tags.includes("gy_setup"), `expected gy_setup tag, got ${mechSetup.tags}`);
  assert.ok(mechPayoff.tags.includes("gy_payoff"), `expected gy_payoff tag, got ${mechPayoff.tags}`);

  const edges = edgesBetween(GY_SETUP_CARD, GY_PAYOFF_CARD);
  const gySetup = edgesOfType(edges, "gy_setup_for");
  assert.equal(gySetup.length, 1);
  assert.equal(gySetup[0].confidence, "medium");
});

test("discard outlet -> GY payoff produces a 'discard_payoff_for' edge", () => {
  const edges = edgesBetween(DISCARD_OUTLET_CARD, GY_PAYOFF_CARD);
  const discardPayoff = edgesOfType(edges, "discard_payoff_for");
  assert.equal(discardPayoff.length, 1);
  assert.equal(discardPayoff[0].sourceCardId, "discard-outlet");
  assert.equal(discardPayoff[0].targetCardId, "gy-payoff");
});

test("banish setup -> banish payoff produces a 'banish_payoff_for' edge", () => {
  const edges = edgesBetween(BANISH_SETUP_CARD, BANISH_PAYOFF_CARD);
  const banishPayoff = edgesOfType(edges, "banish_payoff_for");
  assert.equal(banishPayoff.length, 1);
  assert.equal(banishPayoff[0].sourceCardId, "banish-setup");
  assert.equal(banishPayoff[0].targetCardId, "banish-payoff");
});

test("a Spell/Trap that FUNCTIONALLY references an archetype (search/requirement) produces 'spell_trap_support'", () => {
  const withArchetypeCard = { ...ARCANUM_SUPPORT_SPELL, id: "arcanum-support-vs-card" };
  const edges = edgesBetween(SEARCHER, withArchetypeCard);
  const support = edgesOfType(edges, "spell_trap_support");
  assert.equal(support.length, 1);
  assert.equal(support[0].sourceCardId, "arcanum-support-vs-card");
  assert.equal(support[0].targetCardId, "searcher");
  assert.equal(support[0].confidence, "medium");
});

test("a Trap whose archetype reference is THEMATIC-ONLY (own name, no functional clause) does NOT produce 'spell_trap_support'", () => {
  const edges = edgesBetween(SEARCHER, THEMATIC_ONLY_TRAP);
  const support = edgesOfType(edges, "spell_trap_support");
  assert.equal(
    support.length,
    0,
    `thematic-only name match must not create spell_trap_support, got: ${JSON.stringify(support)}`
  );
});

// --- The three explicit Part L "must NOT create a high score" cases ---

test("SAME ARCHETYPE ALONE (no real mechanical relation) produces ZERO edges", () => {
  const edges = edgesBetween(UNRELATED_A, UNRELATED_B);
  assert.equal(
    edges.length,
    0,
    `same-archetype-alone must not produce any edge, got: ${JSON.stringify(edges)}`
  );
});

test("SAME ATTRIBUTE ALONE (no real mechanical relation, non-Extra-Deck context) produces ZERO edges", () => {
  // UNRELATED_A/B already share EARTH attribute too; re-assert
  // explicitly against a pair that shares ONLY attribute (different
  // archetype) to isolate the claim.
  const attrOnlyA = monster({
    id: "attr-only-a",
    name: "Stone Marcher",
    attribute: "EARTH",
    archetype: "Arch One",
    description: "This card can attack directly.",
  });
  const attrOnlyB = monster({
    id: "attr-only-b",
    name: "Root Behemoth",
    attribute: "EARTH",
    archetype: "Arch Two",
    description: "This card gains 100 DEF for each card in your hand.",
  });
  const edges = edgesBetween(attrOnlyA, attrOnlyB);
  assert.equal(
    edges.length,
    0,
    `same-attribute-alone (outside a real Extra Deck material constraint) must not produce any edge, got: ${JSON.stringify(edges)}`
  );
});

test("'send to Graveyard' KEYWORD OVERLAP ALONE (no real setup/payoff pairing between these two specific cards) produces ZERO edges", () => {
  const edges = edgesBetween(KEYWORD_OVERLAP_A, KEYWORD_OVERLAP_B);
  assert.equal(
    edges.length,
    0,
    `keyword overlap alone (self-send on A, no GY payoff on either) must not produce any edge, got: ${JSON.stringify(edges)}`
  );
});

// --- Normal Summon dependency / starter-extender tag sanity ---

test("a Normal Monster is always tagged normal_summon_dependency", () => {
  const vanilla = {
    id: "vanilla",
    name: "Plain Warrior",
    card_type: "Normal Monster",
    frame_type: "normal",
    attribute: "EARTH",
    monster_type: "Warrior",
    level: 4,
    atk: 1700,
    def: 1200,
    archetype: null,
    description: "A stalwart warrior of the frontier.",
  };
  const mech = computeCardMechanics(vanilla);
  assert.ok(mech.tags.includes("normal_summon_dependency"));
});

test("a Fusion/XYZ/Synchro/Link monster is never tagged normal_summon_dependency", () => {
  const mech = computeCardMechanics(XYZ_NEEDING_CONSTRAINED);
  assert.ok(!mech.tags.includes("normal_summon_dependency"));
});

// ---------------------------------------------------------
// Summary
// ---------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exitCode = 1;
}
