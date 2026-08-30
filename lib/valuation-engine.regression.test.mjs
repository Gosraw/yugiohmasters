// =========================================================
// VALUATION ENGINE REGRESSION SUITE
//
// Plain node:assert/strict harness - NOT vitest. This mirrors the
// pattern already established this session for verifying .mjs/.ts
// logic when `npx vitest` is broken on the device bridge
// (@rollup/rollup-linux-arm64-gnu missing - see CLAUDE.md's "Known
// issues" section): copy to a scratch dir if needed and run with
// plain `node lib/valuation-engine.regression.test.mjs`.
//
// IMPORTANT HONESTY NOTE ON FIXTURE TEXT:
// This sandbox has no network access, so none of the card text
// below could be re-verified against the live YGOPRODeck API or the
// real card_catalog table. Every fixture is written from best-effort
// recollection of real, well-known, heavily-discussed TCG cards,
// aimed at faithfully capturing each card's REAL, documented
// mechanic (the thing every assertion actually tests), not at
// reproducing Konami's exact oracle wording character-for-character.
// Per-card confidence is noted inline. Per the user's own
// instruction, assertions test SEMANTIC FACTS (does the engine
// correctly classify dependency/accessibility/floor/ceiling?), not
// exact score values - so minor wording drift from the real card
// does not invalidate what's being tested here. This is not a
// substitute for running scripts/audit-card-valuation.mjs against
// the real, live catalog.
// =========================================================

import assert from "node:assert/strict";
import {
  extractValuationSignals,
  scoreCard,
  proposeRarity,
  classifyCardContext,
  isWritableForValuation,
  VALUATION_ENGINE_VERSION,
  RARITY_ORDER,
} from "./valuation-engine.mjs";
import { computeSeason1ProvisionalEligibility } from "./format-eligibility.mjs";

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

function evaluate(card) {
  const signals = extractValuationSignals(card);
  const scores = scoreCard(signals, card);
  const rarity = proposeRarity(scores);
  const contextResult = classifyCardContext(signals, scores, card);
  return { signals, scores, rarity, contextResult };
}

function printResult(card, r) {
  console.log(`\n=== ${card.name} ===`);
  console.log(
    `  power=${r.scores.power} accessibility=${r.scores.accessibility} dependency=${r.scores.dependency} ` +
      `genericUtility=${r.scores.genericUtility} consistency=${r.scores.consistency} floor=${r.scores.floor} ` +
      `ceiling=${r.scores.ceiling} oppressiveness=${r.scores.oppressiveness} draftValue=${r.scores.draftValue} ` +
      `-> ${r.rarity} [${r.contextResult.context}]`
  );
  console.log(`  reason: ${r.scores.reason}`);
  console.log(`  context: ${r.contextResult.reason}`);
}

// ---------------------------------------------------------
// Fixtures
// ---------------------------------------------------------

// Confidence: HIGH on the core mechanic (multi-Attribute board
// requirement is the card's whole reason for being niche/casual),
// moderate on exact wording.
const FUH_RIN_KA_ZAN = {
  name: "Fuh-Rin-Ka-Zan",
  card_type: "Trap Card",
  frame_type: "trap",
  archetype: null,
  atk: null,
  def: null,
  description:
    'If you control 4 or more monsters with different Attributes, including WIND, WATER, FIRE and EARTH monsters: Destroy all monsters your opponent controls. You can only activate 1 "Fuh-Rin-Ka-Zan" per turn.',
};

// Confidence: HIGH on the core mechanic (near-unusable outside a
// dedicated empty-hand/empty-Graveyard Normal Monster build).
const SEKKAS_LIGHT = {
  name: "Sekka's Light",
  card_type: "Spell Card",
  frame_type: "spell",
  archetype: null,
  atk: null,
  def: null,
  description:
    "If this is the only card in your hand and you have no cards in your Graveyard: Special Summon as many Normal Monsters with different names as possible from your Deck.",
};

// Confidence: LOW. This card's real oracle text could not be
// confidently recalled in this sandbox (no network to verify).
// Written as a SYNTHETIC representative fixture whose only purpose
// is to test the same false-positive-archetype-name pattern as
// Baronne de Fleur, for a Main Deck monster instead of a Fusion:
// a Dragon-type monster whose name evokes a theme word
// ("Noctovision") that never actually appears anywhere in its own
// functional text, and which has no archetype tag at all.
const NOCTOVISION_DRAGON = {
  name: "Noctovision Dragon",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  atk: 2400,
  def: 1800,
  description:
    "Once per turn, during your Main Phase: You can target 1 monster on the field; until the end of this turn, that target's ATK becomes 0.",
};

// Confidence: HIGH - a very well-known, simple FLIP effect card.
const MAGICIAN_OF_FAITH = {
  name: "Magician of Faith",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  level: 1,
  atk: 300,
  def: 400,
  description:
    "FLIP: Target 1 Spell Card in your Graveyard; add that target to your hand.",
};

// Confidence: MODERATE on exact wording, HIGH on the mechanic
// (generic, targets any 2 monsters, no archetype requirement
// despite an archetype-shaped card name and DB grouping tag).
const FORBIDDEN_DROPLET = {
  name: "Forbidden Droplet",
  card_type: "Spell Card",
  frame_type: "spell",
  archetype: "Forbidden",
  atk: null,
  def: null,
  description:
    "Target 2 face-up monsters on the field with different names; for the rest of this turn after this card resolves, change one monster's ATK to 1000 and the other monster's ATK to 0, also, for the rest of this turn after this card resolves, negate their effects.",
};

// Confidence: HIGH on the material line ("1 Fusion, Synchro, or
// Xyz Monster, plus 1 non-Tuner monster" is a well-known, fully
// generic Fusion requirement), moderate on the rest of the effect
// text's exact wording.
const BARONNE_DE_FLEUR = {
  name: "Baronne de Fleur",
  card_type: "Fusion Monster",
  frame_type: "fusion",
  archetype: "Fleur",
  atk: 1000,
  def: 2500,
  description:
    "1 Fusion, Synchro, or Xyz Monster, plus 1 non-Tuner monster\nMust first be either Fusion, Synchro, or Xyz Summoned, and cannot be Special Summoned by other ways. Cannot be used as material for a Fusion, Synchro, Xyz, or Link Summon. Your opponent cannot activate cards or effects in response to this card's effect activations. Once per turn: You can target 1 monster your opponent controls; until the end of this turn, that target's original ATK and DEF become 0, also its effects are negated. If this card in the Monster Zone is destroyed by battle or by an opponent's card effect: You can Special Summon 1 Level 8 or lower monster from your GY or your opponent's GY, ignoring its Summoning conditions.",
};

// Confidence: HIGH - a famous, simple, extremely generic staple.
// archetype deliberately set to "Harpie" to test the exact same
// name-implies-archetype trap as Baronne, on a Spell Card.
const HARPIES_FEATHER_DUSTER = {
  name: "Harpie's Feather Duster",
  card_type: "Spell Card",
  frame_type: "spell",
  archetype: "Harpie",
  atk: null,
  def: null,
  description: "Destroy all Spell and Trap Cards on the field.",
};

// Confidence: HIGH - a well-known, simple, powerful generic Spell.
const DARK_RULER_NO_MORE = {
  name: "Dark Ruler No More",
  card_type: "Spell Card",
  frame_type: "spell",
  archetype: null,
  atk: null,
  def: null,
  description:
    "Until the end of this turn, all monsters your opponent currently controls have their effects negated, also, for the rest of this turn, monster effects cannot be activated in response to this card's activation.",
};

// Confidence: HIGH - simple, well-known Normal Trap.
const NEGATE_ATTACK = {
  name: "Negate Attack",
  card_type: "Trap Card",
  frame_type: "trap",
  archetype: null,
  atk: null,
  def: null,
  description:
    "When an opponent's monster declares an attack: Negate the attack, and if you do, end the Battle Phase.",
};

// Confidence: MODERATE on exact wording, HIGH on the mechanic
// (usable from the Graveyard after being discarded/milled, which
// is the whole point of the card and a real accessibility/floor
// upside over a plain Set-and-wait Trap like Negate Attack).
const SCRAP_IRON_SCARECROW = {
  name: "Scrap-Iron Scarecrow",
  card_type: "Trap Card",
  frame_type: "trap",
  archetype: null,
  atk: null,
  def: null,
  description:
    "If this card is in your Graveyard, during the turn it was sent there: You can banish this card; negate the attack of 1 of your opponent's monsters.",
};

// Confidence: HIGH on the material line ("1 'Red-Eyes' monster"
// is the famous, iconic restriction on this card), moderate on the
// rest of the effect text's exact wording.
const RED_EYES_DARK_DRAGOON = {
  name: "Red-Eyes Dark Dragoon",
  card_type: "Fusion Monster",
  frame_type: "fusion",
  archetype: "Red-Eyes",
  atk: 3000,
  def: 2000,
  description:
    '1 "Red-Eyes" monster + 1 Synchro Monster or Xyz Monster\nThis card can only be Special Summoned by Fusion Summon, and cannot be Special Summoned by other ways. If this card is Fusion Summoned: You can banish 1 card on the field. Once per turn, if a monster(s) would be destroyed by battle or card effect, you can banish it instead. Gains 500 ATK for each monster banished by this effect.',
};

// Confidence: MODERATE on exact wording, HIGH on the mechanic
// (a Main Deck boss monster with a hard, named-material Special
// Summon requirement - cannot be Normal Summoned at all).
const BLUE_EYES_ULTIMATE_SPIRIT_DRAGON = {
  name: "Blue-Eyes Ultimate Spirit Dragon",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: "Blue-Eyes",
  level: 12,
  atk: 4000,
  def: 4000,
  description:
    'Cannot be Normal Summoned/Set. Must first be Special Summoned (from your hand) by banishing 1 "Blue-Eyes" monster and 1 "Dragon Spirit of White Dragon" you control. Unaffected by other monsters\' effects. Once per turn: You can target 1 card on the field; banish it.',
};

// ---------------------------------------------------------
// CODEX CALIBRATION REFERENCE CARDS (added 2026-08-30)
//
// These 9 cards are the explicit "approved reference" calibration
// table from the Codex cardpool-balancing brief - human-judged
// anchors the brief says every other card's rarity should be
// compared against. They are added here for a different reason than
// the fixtures above: not just to catch a regression in a known
// engine bug, but to TRACK, IN CODE, how far the current automated
// engine's output diverges from those human-judged anchors, so that
// divergence is never silently lost between chat sessions.
//
// Hand-traced (not machine-verified beyond this file's own node-run,
// since this sandbox has no vitest) against the ACTUAL scoreCard/
// proposeRarity logic as of the 2026-08-30 fixes below. Confidence
// on exact oracle wording is noted per card; the mechanic each
// assertion tests is HIGH confidence in every case.
//
// 2026-08-30 FIXES applied directly to lib/valuation-engine.mjs as
// part of this same audit (all three verified against Maxx "C"
// specifically, all three still pass every pre-existing assertion
// above with zero regressions):
//   1. isQuickEffect only matched the literal "(Quick Effect)"
//      bracket, missing the equally common "(This is a Quick
//      Effect.)" phrasing - broadened to any "quick effect"
//      occurrence.
//   2. gainsLifePoints only matched spelled-out "life points",
//      missing the very common "LP" abbreviation ("gain 1000 LP").
//   3. classifyReference()'s self-reference check required an EXACT
//      full-name match, so a card whose own name contains an
//      internal quoted fragment (Maxx "C" quotes itself as
//      `"Maxx "C""`, which a naive scan reads as just the inner term
//      "C") fell through to ambiguous_reference and was wrongly
//      penalized as an external dependency. Fixed to also recognize
//      a term quoted inside the card's OWN name string.
//
// KNOWN REMAINING GAP (not fixed this session - a real modeling
// limitation, not a regex bug): this engine scores a card entirely
// from its OWN text. Reactive "hand trap" cards (Maxx "C", Tragoedia,
// Gorz, Battle Fader, Swift Scarecrow, D.D. Crow, Effect Veiler) draw
// most of their REAL value from a game-external fact the text can
// never state - how often the OPPONENT'S average deck enables the
// trigger condition (Special Summons per turn, attacks made, cards
// banished). Two concrete, hand-verified examples below (Maxx "C"
// and Effect Veiler) land one-to-two rarity tiers BELOW their
// Codex-approved tier even after the three fixes above. The
// recommended fix is NOT more regex tuning - it's what
// valuation_manually_overridden already exists for: treat this
// entire approved calibration table (and, by extension, the general
// class of reactive/hand-trap disruption it represents) as
// manually-set anchors, never overwritten by a future audit run. See
// the cardpool balance audit report for the full reasoning.
// ---------------------------------------------------------

// Confidence: HIGH on the mechanic (a hand trap that punishes the
// OPPONENT'S Special Summons with a Life Point drip - its real-world
// value is almost entirely about opponent deck-speed, which is the
// Codex brief's own flagship "do not rank by modern reputation"
// example), MODERATE on exact wording.
const MAXX_C = {
  name: 'Maxx "C"',
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  level: 2,
  atk: 0,
  def: 0,
  description:
    'When your opponent Special Summons a monster(s): You can activate this effect; until the end of this turn, each time a monster(s) is Special Summoned, you gain 1000 LP (This is a Quick Effect.). You can only use this effect of "Maxx "C"" once per turn.',
};

// Confidence: HIGH on the mechanic (a Quick Effect single-monster
// negate, functionally a clean generic hand trap), HIGH on wording -
// this is short, simple, well-known text.
const EFFECT_VEILER = {
  name: "Effect Veiler",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  level: 1,
  atk: 0,
  def: 0,
  description:
    'During your opponent\'s Main Phase (Quick Effect): You can send this card from your hand to the Graveyard; until the end of this turn, one face-up monster your opponent controls has its effects negated. You can only use this effect of "Effect Veiler" once per turn.',
};

// Confidence: MODERATE on exact wording (a long, unusually complex
// effect for a hand trap), HIGH on the core mechanic (hand-size-based
// stats while in hand, Special Summons itself after battle damage,
// and can take over an opponent's monster).
const TRAGOEDIA = {
  name: "Tragoedia",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  level: 8,
  atk: 2000,
  def: 2000,
  description:
    "While this card is in your hand, it gains the following effect based on the number of cards in your hand. * This card's Level, ATK, and DEF become 1000 x the number of cards in your hand. If you take battle damage: You can Special Summon this card from your hand in Defense Position, and if you do, you can also target 1 monster your opponent controls; equip that target to this card (that monster's control does not change), also its effects are negated and it cannot declare an attack while equipped this way, and this card's Level, ATK, and DEF become the same as that monster's.",
};

// Confidence: HIGH on the core mechanic (Special Summons itself off
// battle damage and makes a token), MODERATE on exact token stats.
const GORZ = {
  name: "Gorz the Emissary of Darkness",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  level: 8,
  atk: 2700,
  def: 2500,
  description:
    'When you take battle damage, if this card is in your hand (Quick Effect): You can Special Summon this card, then Special Summon 1 "Emissary of Darkness Token" (Fiend/DARK/Level 7/ATK 2700/DEF 2500) in Attack Position.',
};

// Confidence: HIGH - short, simple, extremely well-known text.
const BATTLE_FADER = {
  name: "Battle Fader",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  level: 1,
  atk: 0,
  def: 0,
  description:
    "When an opponent's monster declares an attack: You can Special Summon this card from your hand, then, if you do, end the Battle Phase. During the End Phase, if this card was Special Summoned this way: Send this card to the Graveyard.",
};

// Confidence: HIGH - short, simple, well-known text.
const SWIFT_SCARECROW = {
  name: "Swift Scarecrow",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  level: 1,
  atk: 0,
  def: 0,
  description:
    "When an opponent's monster declares an attack: You can banish this card from your hand; end the Battle Phase.",
};

// Confidence: HIGH - short, simple, well-known text.
const DD_CROW = {
  name: "D.D. Crow",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  level: 1,
  atk: 100,
  def: 100,
  description:
    "You can banish this card from your hand or GY; banish 1 card in your opponent's GY.",
};

// Confidence: HIGH - short, simple, extremely well-known text.
const GIANT_TRUNADE = {
  name: "Giant Trunade",
  card_type: "Spell Card",
  frame_type: "spell",
  archetype: null,
  atk: null,
  def: null,
  description: "Return all Spell and Trap Cards on the field to the hand.",
};

// Confidence: HIGH - well-known text; the archetype-narrow condition
// (Normal Monsters only, same name x2) is the whole reason the Codex
// brief uses this as its "theoretical ceiling exceeds real
// applicability" example.
const RESCUE_RABBIT = {
  name: "Rescue Rabbit",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  level: 4,
  atk: 300,
  def: 100,
  description:
    'You can banish this card from your hand or field; Special Summon 2 Level 4 or lower Normal Monsters with the same name from your Deck, but banish them during the End Phase. You can only use this effect of "Rescue Rabbit" once per turn.',
};

// ---------------------------------------------------------
// Run everything, print full component output, then assert.
// ---------------------------------------------------------

console.log(`Valuation engine regression suite - engine ${VALUATION_ENGINE_VERSION}\n`);

const cards = [
  FUH_RIN_KA_ZAN,
  SEKKAS_LIGHT,
  NOCTOVISION_DRAGON,
  MAGICIAN_OF_FAITH,
  FORBIDDEN_DROPLET,
  BARONNE_DE_FLEUR,
  HARPIES_FEATHER_DUSTER,
  DARK_RULER_NO_MORE,
  NEGATE_ATTACK,
  SCRAP_IRON_SCARECROW,
  RED_EYES_DARK_DRAGOON,
  BLUE_EYES_ULTIMATE_SPIRIT_DRAGON,
  MAXX_C,
  EFFECT_VEILER,
  TRAGOEDIA,
  GORZ,
  BATTLE_FADER,
  SWIFT_SCARECROW,
  DD_CROW,
  GIANT_TRUNADE,
  RESCUE_RABBIT,
];
const results = new Map();
for (const card of cards) {
  const r = evaluate(card);
  results.set(card.name, r);
  printResult(card, r);
}

console.log("\n--- Assertions ---\n");

test("Fuh-Rin-Ka-Zan: severe accessibility/consistency penalty from the 4-Attribute requirement", () => {
  const r = results.get("Fuh-Rin-Ka-Zan");
  assert.equal(r.signals.distinctAttributesRequired, 4);
  // Semantic fact, not a magic number: a 4-simultaneous-Attribute
  // requirement must be the single dominant driver of this card's
  // dependency score (base dependency starts at 1.0).
  assert.ok(r.scores.dependency >= 4.5, `expected a clearly elevated dependency, got ${r.scores.dependency}`);
  assert.ok(r.scores.floor <= 2, `expected floor <= 2 (near-brick without the setup), got ${r.scores.floor}`);
  assert.ok(r.scores.consistency <= 5, `expected meaningfully reduced consistency, got ${r.scores.consistency}`);
});

test("Fuh-Rin-Ka-Zan: proposed rarity is low despite a strong resolved effect (directionally matches the real report: Legendary -> Normal-ish)", () => {
  const r = results.get("Fuh-Rin-Ka-Zan");
  assert.ok(["Normal", "Rare"].includes(r.rarity), `expected Normal/Rare, got ${r.rarity}`);
});

test("Sekka's Light: severe dependency/floor penalty from the empty-hand/empty-GY condition", () => {
  const r = results.get("Sekka's Light");
  assert.ok(r.scores.floor <= 4, `expected low floor, got ${r.scores.floor}`);
});

test("Forbidden Droplet: must NOT be classified as archetype-dependent", () => {
  const r = results.get("Forbidden Droplet");
  assert.equal(r.signals.archetypeIsThematicOnly, true, "archetype tag 'Forbidden' must be recognized as thematic-only");
  assert.equal(r.signals.archetypeFunctionalRefs.length, 0);
  assert.ok(r.scores.dependency <= 2.5, `expected low dependency, got ${r.scores.dependency}`);
});

test("Forbidden Droplet: reads as a generically strong, broadly usable card (Super Rare or higher)", () => {
  const r = results.get("Forbidden Droplet");
  assert.ok(r.scores.genericUtility >= 5.5, `expected high genericUtility, got ${r.scores.genericUtility}`);
  // Semantic fact, not an exact score: this is a real, generic,
  // heavily-played staple - it must land at Super Rare or above.
  const rank = RARITY_ORDER.indexOf(r.rarity);
  assert.ok(rank >= RARITY_ORDER.indexOf("Super Rare"), `expected Super Rare or higher, got ${r.rarity}`);
});

test("Baronne de Fleur: must NOT become Fleur-dependent merely because of its name/archetype tag", () => {
  const r = results.get("Baronne de Fleur");
  assert.equal(r.signals.materials.specificity, "generic", `expected generic materials, got ${r.signals.materials.specificity}`);
  assert.equal(r.signals.archetypeIsThematicOnly, true, "archetype tag 'Fleur' must be recognized as thematic-only");
  assert.ok(r.scores.dependency <= 3, `expected low dependency, got ${r.scores.dependency}`);
});

test("Baronne de Fleur: broadly splashable Fusion (generic materials boost genericUtility)", () => {
  const r = results.get("Baronne de Fleur");
  assert.ok(r.scores.genericUtility >= 5, `expected decent genericUtility, got ${r.scores.genericUtility}`);
});

test("Harpie's Feather Duster: archetype-shaped name must not create dependency, and it must rate as a genuinely strong generic staple", () => {
  const r = results.get("Harpie's Feather Duster");
  assert.equal(r.signals.archetypeIsThematicOnly, true);
  assert.ok(r.scores.dependency <= 2, `expected near-zero dependency, got ${r.scores.dependency}`);
  // Semantic fact (per the user's own "do not optimize for exact
  // percentages" instruction): a zero-cost, zero-dependency,
  // mass-removal generic staple must land at Super Rare or above,
  // not Rare or below - the exact draftValue number is not asserted.
  const rank = RARITY_ORDER.indexOf(r.rarity);
  assert.ok(rank >= RARITY_ORDER.indexOf("Super Rare"), `expected Super Rare or higher, got ${r.rarity}`);
});

test("Dark Ruler No More: generic, high power, zero dependency", () => {
  const r = results.get("Dark Ruler No More");
  assert.equal(r.signals.negatesActivationOrEffect, true, "the 'have their effects negated' phrasing must be recognized");
  assert.ok(r.scores.power >= 6.5, `expected high power, got ${r.scores.power}`);
  assert.ok(r.scores.dependency <= 2, `expected zero/near-zero dependency, got ${r.scores.dependency}`);
});

test("Red-Eyes Dark Dragoon: named Fusion material creates genuine dependency, clearly above a generic-material Fusion", () => {
  const redEyes = results.get("Red-Eyes Dark Dragoon");
  const baronne = results.get("Baronne de Fleur");
  assert.equal(redEyes.signals.materials.specificity, "named");
  // Semantic fact from the Season 1 spec point 4: "named monsters ->
  // high dependency" as compared against "generic materials ->
  // potentially broadly usable" - tested as a relative ordering
  // rather than an absolute score, since the exact number isn't
  // the point.
  assert.ok(
    redEyes.scores.dependency > baronne.scores.dependency + 1.5,
    `expected Red-Eyes' named-material dependency (${redEyes.scores.dependency}) to clearly exceed Baronne's generic-material dependency (${baronne.scores.dependency})`
  );
  assert.ok(redEyes.scores.floor <= 4, `expected low floor without the archetype, got ${redEyes.scores.floor}`);
});

test("Red-Eyes Dark Dragoon: dependency does not crush ceiling - a real payoff stays exciting", () => {
  const r = results.get("Red-Eyes Dark Dragoon");
  assert.ok(r.scores.ceiling >= 7, `expected high ceiling for a real archetype payoff, got ${r.scores.ceiling}`);
});

test("Blue-Eyes Ultimate Spirit Dragon: mandatory named Special Summon requirement is a hard dependency", () => {
  const r = results.get("Blue-Eyes Ultimate Spirit Dragon");
  const hasMandatory = r.signals.classifiedRefs.some((ref) => ref.type === "mandatory_requirement");
  assert.equal(hasMandatory, true, "expected a classified mandatory_requirement reference");
  assert.ok(r.scores.floor <= 2, `expected near-zero floor without its named requirements, got ${r.scores.floor}`);
  assert.ok(r.scores.ceiling >= 7, `expected a high ceiling as a genuine archetype boss, got ${r.scores.ceiling}`);
});

test("Negate Attack vs. Scrap-Iron Scarecrow: both are attack-only negates, NOT scored like a universal negate", () => {
  const negateAttack = results.get("Negate Attack");
  const darkRuler = results.get("Dark Ruler No More");
  assert.equal(negateAttack.signals.negatesAttack, true);
  assert.equal(negateAttack.signals.negatesActivationOrEffect, false);
  assert.ok(
    negateAttack.scores.power < darkRuler.scores.power,
    `expected attack-only negate power (${negateAttack.scores.power}) < universal negate power (${darkRuler.scores.power})`
  );
});

test("Scrap-Iron Scarecrow: Graveyard-usability gives it a real accessibility/floor edge over a plain Set-and-wait Negate Attack", () => {
  const scarecrow = results.get("Scrap-Iron Scarecrow");
  const negateAttack = results.get("Negate Attack");
  assert.equal(scarecrow.signals.usableFromGraveyard, true);
  assert.ok(
    scarecrow.scores.accessibility > negateAttack.scores.accessibility,
    `expected Scarecrow accessibility (${scarecrow.scores.accessibility}) > Negate Attack accessibility (${negateAttack.scores.accessibility})`
  );
});

test("Negate-family cards do not fully converge: at least one component score differs across the three", () => {
  const a = results.get("Negate Attack").scores;
  const b = results.get("Scrap-Iron Scarecrow").scores;
  const c = results.get("Dark Ruler No More").scores;
  const triples = [
    [a.power, b.power, c.power],
    [a.accessibility, b.accessibility, c.accessibility],
    [a.floor, b.floor, c.floor],
  ];
  const allIdentical = triples.every(([x, y, z]) => x === y && y === z);
  assert.equal(allIdentical, false, "expected at least one axis to meaningfully differ across the three negate-family cards");
});

test("Magician of Faith: Graveyard-to-hand recursion is now recognized as card advantage", () => {
  const r = results.get("Magician of Faith");
  assert.equal(r.signals.searches, true, "expected the broadened searches regex to catch Graveyard-to-hand recursion");
  assert.equal(r.signals.isFlip, true);
  assert.ok(r.scores.accessibility <= 6, `expected a Flip accessibility penalty, got ${r.scores.accessibility}`);
});

test("Noctovision Dragon (synthetic representative fixture): no archetype tag means no archetype dependency", () => {
  const r = results.get("Noctovision Dragon");
  assert.equal(r.signals.classifiedRefs.length, 0);
  assert.ok(r.scores.dependency <= 2, `expected near-zero dependency, got ${r.scores.dependency}`);
});

test("oppressiveness is fully decoupled from draftValue (same power/dependency profile, different oppressiveness, draftValue formula never references it)", () => {
  // Dark Ruler No More has real oppressiveness signal (repeatable-
  // feeling blanket negation with no OPT found) but that must never
  // leak into draftValue - only recommendOppressiveness() consumes
  // the oppressiveness axis.
  const r = results.get("Dark Ruler No More");
  assert.ok(r.scores.oppressiveness > 0, "expected a nonzero oppressiveness reading to exist for this card");
  // Recompute draftValue by hand from the documented formula and
  // confirm oppressiveness truly isn't a term in it.
  const expected =
    r.scores.floor * 0.28 +
    r.scores.ceiling * 0.14 +
    r.scores.accessibility * 0.2 +
    r.scores.genericUtility * 0.16 +
    r.scores.consistency * 0.14 -
    r.scores.dependency * 0.22;
  const clamped = Math.max(0, Math.min(10, expected));
  assert.ok(
    Math.abs(clamped - r.scores.draftValue) < 0.05,
    `draftValue (${r.scores.draftValue}) should match the oppressiveness-free formula (${clamped.toFixed(2)})`
  );
});

// =========================================================
// 2026-08-25 LEGENDARY RARITY RECALIBRATION - regression coverage
//
// Production problem this addresses: among the true Season-1
// format_eligible pool (~8,954 cards), only 13 cards proposed as
// Legendary, and 12 of those 13 were Fusion Monsters. Root-caused to
// two scoreCard() bugs (see the two "NOTE (2026-08-25...)" comments
// in valuation-engine.mjs): a flat, functionally-unjustified Extra
// Deck power bonus, and a ceiling formula whose every bonus term
// required an archetype-lock/build-around signal, leaving genuinely
// generic, powerful cards (especially Spell/Trap, which have no ATK
// stat) with no path to a high ceiling. Every fixture below is a
// SYNTHETIC representative card (not a claim about a specific real
// card's exact oracle text) engineered to exercise one specific
// Legendary-path or anti-pattern this recalibration targets. Score
// values are hand-derived from the documented scoreCard() formula
// and asserted with margin, not as exact-match magic numbers - see
// the file header's note on semantic-fact-over-exact-score testing
// philosophy, which applies here too.
// =========================================================

// Path A (generic/high-floor power) - strong, low-dependency Effect
// Monster. No archetype, no named materials - the new generic-power
// ceiling bonus (power >= 7.2 && dependency <= 4.0) is the ONLY way
// this reaches a Legendary-caliber ceiling.
const CATACLYSM_SENTINEL = {
  name: "Cataclysm Sentinel",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  atk: 2600,
  def: 2000,
  description:
    'You can target 1 card your opponent controls; negate its effects, then destroy that target, also, if you do, draw 1 card. You can only use this effect of "Cataclysm Sentinel" once per turn.',
};

// Path A - exceptional generic Spell. Spells have no ATK stat, so
// this can ONLY reach a high power/ceiling through non-ATK signals -
// directly demonstrates the "game-defining Spell/Trap utility" path
// (Design Target C) the old ceiling formula had no route to at all.
const ABSOLUTE_RECKONING = {
  name: "Absolute Reckoning",
  card_type: "Spell Card",
  frame_type: "spell",
  archetype: null,
  atk: null,
  def: null,
  description:
    "Target 1 card your opponent controls; negate its effects, then destroy that target, also, if you do, draw 1 card.",
};

// Path B - exceptional generic Trap. Same text shape as Absolute
// Reckoning, but the Trap accessibility penalty (-1.5) pushes it
// through the build-around ceiling path (>=9.4) rather than Path A's
// draftValue/floor gate - still a real, legitimate route to
// Legendary for a non-monster, non-archetype card.
const ABSOLUTE_VERDICT = {
  name: "Absolute Verdict",
  card_type: "Trap Card",
  frame_type: "trap",
  archetype: null,
  atk: null,
  def: null,
  description:
    "Target 1 card your opponent controls; negate its effects, then destroy that target, also, if you do, draw 1 card.",
};

// Path A - exceptional Xyz with GENERIC materials ("2 Level 4
// monsters" - no name, no Attribute/Type/Tuner lock). Demonstrates
// an Extra Deck boss reaching Legendary on the strength of its own
// effect, not because it's an Xyz Monster (the removed +0.8 flat
// Extra Deck power bonus would have applied here too under the old
// formula - this fixture proves the card clears the bar WITHOUT it).
const UTOPIC_ASCENSION_DRAGON = {
  name: "Utopic Ascension Dragon",
  card_type: "XYZ Monster",
  frame_type: "xyz",
  archetype: null,
  rank: 4,
  atk: 2500,
  def: 2000,
  description:
    '2 Level 4 monsters\nYou can detach 1 material from this card; negate the activation of a Spell/Trap Card or the effect of a Monster Card, and if you do, destroy that card, also, if you destroyed it, draw 1 card.',
};

// Path A - exceptional Fusion with GENERIC materials ("2 monsters").
// Directly tests Design Target D: "Fusion/Xyz may be Legendary but
// only when functionally exceptional; Extra Deck type itself must
// not be an advantage" - this card earns Legendary purely from its
// own low-dependency power, identically to how a Main Deck monster
// with the same effect text would.
const ABSOLUTE_NEMESIS_DRAGON = {
  name: "Absolute Nemesis Dragon",
  card_type: "Fusion Monster",
  frame_type: "fusion",
  archetype: null,
  atk: 3000,
  def: 2500,
  description:
    "2 monsters\nYou can target 1 card your opponent controls; negate its effects, then destroy that target, also, if you do, draw 1 card.",
};

// UPDATED 2026-08-30 (human calibration pass): this fixture used to
// be the demonstration that a named-materials Fusion could still
// reach Legendary via Path B's ceiling >= 9.9 escape. The calibration
// brief explicitly downgrades this exact shape of real card (a strong
// effect gated behind 2+ specific named materials - see Van'Dalgyon
// the Dark Dragon Lord = Ultra, Number C106: Giant Red Hand = Ultra,
// Elemental HERO Chaos Neos = Ultra/Secret borderline: "theoretical
// ceiling should not override practical accessibility"), so the
// ceiling >= 9.9 escape is now gated on dependency <= 4.0 - named
// materials alone push dependency to 4.5+, closing that path for
// every named-material card, not just this one. This card now lands
// at Secret Rare (strong effect, meaningfully penalized accessibility/
// dependency from 2 named materials, but not the maximal, count>=3
// penalty) - a deliberate, intended change, not a regression. See
// LIGHT_AND_DARKNESS_DRAGON_FIXTURE below for the case that SHOULD
// still reach Legendary (Attribute-constrained, not named, materials).
const RADIANT_CATACLYSM_OVERLORD = {
  name: "Radiant Cataclysm Overlord",
  card_type: "Fusion Monster",
  frame_type: "fusion",
  archetype: null,
  atk: 3000,
  def: 2500,
  description:
    '1 "Radiant Sentinel" + 1 "Cataclysm Oracle"\nYou can target 1 card your opponent controls; negate its effects, then destroy that target, also, if you do, draw 1 card.',
};

// NEGATIVE CASE - a high-ceiling, high-dependency Fusion boss that
// must NOT reach Legendary: named materials AND a mandatory
// Special-Summon requirement stack two separate floor penalties
// (-4.5 each) to a floor of 0, and dependency (7.0) is high enough
// that genericUtility's removal bonus never applies and the >=6
// penalty fires. Directly tests "weak-floor/high-dependency boss
// does not automatically become Legendary" AND "Extra Deck high
// ceiling alone is insufficient" - this card's ceiling clears the
// >=9.0 gate on its own, proving ceiling isn't what's blocking it.
const CHRONOVOID_APOCALYPSE_DRAGON = {
  name: "Chronovoid Apocalypse Dragon",
  card_type: "Fusion Monster",
  frame_type: "fusion",
  archetype: null,
  atk: 3000,
  def: 2500,
  description:
    '1 "Chronovoid Sentinel" + 1 "Chronovoid Oracle"\nThis card cannot be Special Summoned except by Tributing 1 "Chronovoid" monster. If this card is Special Summoned: You can target 1 card your opponent controls; negate its effects, then destroy that target, also, if you do, draw 1 card.',
};

// PAIRED FIXTURES - identical effect text and ATK, differing ONLY in
// card_type (Effect Monster vs. Fusion Monster). Directly tests
// "Fusion type alone gives no bonus": power must be IDENTICAL between
// the two, proving the removed flat +0.8 Extra Deck power bonus has
// no replacement anywhere in the formula.
const TWIN_TEST_ALPHA_MAIN_DECK = {
  name: "Twin Test Alpha",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  atk: 2000,
  def: 2000,
  description: "Destroy 1 card your opponent controls.",
};
const TWIN_TEST_BETA_FUSION = {
  name: "Twin Test Beta",
  card_type: "Fusion Monster",
  frame_type: "fusion",
  archetype: null,
  atk: 2000,
  def: 2000,
  description: "Destroy 1 card your opponent controls.",
};

// A deliberately mediocre, low-power generic Fusion - included in the
// mixed-pool calibration test below to prove Extra Deck status alone
// doesn't inflate a weak card into the Legendary conversation either.
const MEDIOCRE_FUSION_BEATER = {
  name: "Mediocre Fusion Beater",
  card_type: "Fusion Monster",
  frame_type: "fusion",
  archetype: null,
  atk: 2400,
  def: 2000,
  description: "2 monsters\nThis card gains 300 ATK.",
};

for (const card of [
  CATACLYSM_SENTINEL,
  ABSOLUTE_RECKONING,
  ABSOLUTE_VERDICT,
  UTOPIC_ASCENSION_DRAGON,
  ABSOLUTE_NEMESIS_DRAGON,
  RADIANT_CATACLYSM_OVERLORD,
  CHRONOVOID_APOCALYPSE_DRAGON,
  TWIN_TEST_ALPHA_MAIN_DECK,
  TWIN_TEST_BETA_FUSION,
  MEDIOCRE_FUSION_BEATER,
]) {
  const r = evaluate(card);
  results.set(card.name, r);
  printResult(card, r);
}

console.log("\n--- 2026-08-25 recalibration assertions ---\n");

test("Cataclysm Sentinel: strong generic Effect Monster reaches Legendary via Path A", () => {
  const r = results.get("Cataclysm Sentinel");
  assert.ok(r.scores.dependency <= 2, `expected near-zero dependency, got ${r.scores.dependency}`);
  assert.ok(r.scores.ceiling >= 9.0, `expected a high ceiling from the generic-power bonus, got ${r.scores.ceiling}`);
  assert.equal(r.rarity, "Legendary", `expected Legendary, got ${r.rarity}`);
});

test("Absolute Reckoning: exceptional generic Spell reaches Legendary (no ATK stat available at all)", () => {
  const r = results.get("Absolute Reckoning");
  assert.equal(r.signals.isSpell, true);
  assert.ok(r.scores.ceiling >= 9.0, `expected a high ceiling, got ${r.scores.ceiling}`);
  assert.equal(r.rarity, "Legendary", `expected Legendary, got ${r.rarity}`);
});

test("Absolute Verdict: exceptional generic Trap reaches Legendary via the build-around ceiling path", () => {
  const r = results.get("Absolute Verdict");
  assert.equal(r.signals.isTrap, true);
  assert.ok(r.scores.ceiling >= 9.4, `expected ceiling to clear the Path B threshold, got ${r.scores.ceiling}`);
  assert.equal(r.rarity, "Legendary", `expected Legendary, got ${r.rarity}`);
});

test("Utopic Ascension Dragon: exceptional Xyz with GENERIC materials reaches Legendary", () => {
  const r = results.get("Utopic Ascension Dragon");
  assert.equal(r.signals.materials.specificity, "generic", `expected generic Xyz materials, got ${r.signals.materials.specificity}`);
  assert.equal(r.rarity, "Legendary", `expected Legendary, got ${r.rarity}`);
});

test("Absolute Nemesis Dragon: exceptional Fusion with GENERIC materials reaches Legendary on its own merits", () => {
  const r = results.get("Absolute Nemesis Dragon");
  assert.equal(r.signals.materials.specificity, "generic", `expected generic Fusion materials, got ${r.signals.materials.specificity}`);
  assert.equal(r.rarity, "Legendary", `expected Legendary, got ${r.rarity}`);
});

test("Radiant Cataclysm Overlord: named-materials Fusion no longer reaches Legendary on ceiling alone (2026-08-30 calibration change)", () => {
  const r = results.get("Radiant Cataclysm Overlord");
  assert.equal(r.signals.materials.specificity, "named", `expected named Fusion materials, got ${r.signals.materials.specificity}`);
  assert.ok(r.scores.dependency > 4.0, `expected named materials to push dependency past the ceiling-escape cutoff, got ${r.scores.dependency}`);
  assert.notEqual(r.rarity, "Legendary", `expected NOT Legendary (named materials close the ceiling->=9.9 escape) - got ${r.rarity}`);
  assert.ok(["Secret Rare", "Ultra Rare"].includes(r.rarity), `expected the card to still land Secret/Ultra on the strength of its effect, got ${r.rarity}`);
});

test("Chronovoid Apocalypse Dragon: high ceiling alone is insufficient - weak floor/genericUtility block Legendary", () => {
  const r = results.get("Chronovoid Apocalypse Dragon");
  assert.ok(r.scores.ceiling >= 9.0, `expected ceiling to clear the base gate on its own (proving ceiling isn't what blocks this card), got ${r.scores.ceiling}`);
  assert.ok(r.scores.floor < 4.5, `expected a collapsed floor from stacked named-materials + mandatory-requirement penalties, got ${r.scores.floor}`);
  assert.ok(r.scores.genericUtility < 4.0, `expected genericUtility below the Legendary gate, got ${r.scores.genericUtility}`);
  assert.notEqual(r.rarity, "Legendary", `expected NOT Legendary despite the high ceiling, got ${r.rarity}`);
});

test("Fusion type alone gives no power bonus: identical text/ATK, different card_type -> identical power", () => {
  const alpha = results.get("Twin Test Alpha");
  const beta = results.get("Twin Test Beta");
  assert.equal(alpha.signals.isExtraDeckCard, false);
  assert.equal(beta.signals.isExtraDeckCard, true);
  assert.equal(
    alpha.scores.power,
    beta.scores.power,
    `expected identical power regardless of Extra Deck status (Main Deck ${alpha.scores.power} vs. Fusion ${beta.scores.power})`
  );
});

test("Fusion type alone still costs accessibility (the Extra Deck board-presence tax is unchanged, only the power bonus was removed)", () => {
  const alpha = results.get("Twin Test Alpha");
  const beta = results.get("Twin Test Beta");
  assert.ok(
    beta.scores.accessibility < alpha.scores.accessibility,
    `expected Fusion accessibility (${beta.scores.accessibility}) < Main Deck accessibility (${alpha.scores.accessibility})`
  );
});

test("Mediocre Fusion Beater: weak generic Fusion does not become Legendary just because it's Extra Deck", () => {
  const r = results.get("Mediocre Fusion Beater");
  assert.notEqual(r.rarity, "Legendary", `expected a low-power Fusion to NOT be Legendary, got ${r.rarity}`);
});

test("current excluded mechanics (Synchro/Link/Pendulum/Illusion) remain excluded from the eligible pool regardless of engine score", () => {
  // A deliberately maximal-power Synchro fixture - if this were
  // eligible by mechanics alone, it would very likely propose
  // Legendary. computeSeason1ProvisionalEligibility must reject it on
  // mechanics grounds before rarity is ever considered.
  const bannedSynchro = {
    name: "Excluded Synchro Overlord",
    card_type: "Synchro Monster",
    frame_type: "synchro",
    archetype: null,
    atk: 3000,
    master_duel_status: "unlimited",
    release_date: "2015-01-01",
    description: "2+ non-Tuner monsters\nDestroy all cards your opponent controls.",
  };
  const bannedLink = {
    name: "Excluded Link Overlord",
    card_type: "Link Monster",
    frame_type: "link",
    archetype: null,
    atk: 3000,
    master_duel_status: "unlimited",
    release_date: "2015-01-01",
    description: "2+ monsters\nDestroy all cards your opponent controls.",
  };
  const bannedPendulum = {
    name: "Excluded Pendulum Overlord",
    card_type: "Pendulum Effect Monster",
    frame_type: "effect_pendulum",
    archetype: null,
    atk: 3000,
    master_duel_status: "unlimited",
    release_date: "2015-01-01",
    description: "Destroy all cards your opponent controls.",
  };
  const bannedIllusion = {
    name: "Excluded Illusion Overlord",
    card_type: "Effect Monster",
    frame_type: "effect",
    race: "Illusion",
    archetype: null,
    atk: 3000,
    master_duel_status: "unlimited",
    release_date: "2015-01-01",
    description: "Destroy all cards your opponent controls.",
  };
  for (const card of [bannedSynchro, bannedLink, bannedPendulum, bannedIllusion]) {
    assert.equal(
      computeSeason1ProvisionalEligibility(card),
      false,
      `expected ${card.name} to be excluded from Season 1 eligibility regardless of engine score`
    );
  }
  // Xyz and Fusion, by contrast, ARE allowed mechanics for Season 1 -
  // confirms the exclusion above is mechanic-specific, not a blanket
  // "no Extra Deck cards" rule.
  const allowedXyz = { ...bannedSynchro, name: "Allowed Xyz", card_type: "XYZ Monster", frame_type: "xyz" };
  const allowedFusion = { ...bannedSynchro, name: "Allowed Fusion", card_type: "Fusion Monster", frame_type: "fusion" };
  assert.equal(computeSeason1ProvisionalEligibility(allowedXyz), true);
  assert.equal(computeSeason1ProvisionalEligibility(allowedFusion), true);
});

test("manual overrides remain untouched: isWritableForValuation() never allows a manually-overridden card through", () => {
  const overridden = { name: "Reviewed By Hand", valuation_manually_overridden: true };
  const notOverridden = { name: "Not Yet Reviewed", valuation_manually_overridden: false };
  const unset = { name: "Never Set" };
  assert.equal(isWritableForValuation(overridden), false, "a manually-overridden card must never be writable");
  assert.equal(isWritableForValuation(notOverridden), true);
  assert.equal(isWritableForValuation(unset), true, "an unset flag must default to writable, not locked");
});

test("CALIBRATION REGRESSION: Legendary proposals across a representative mixed pool are not dominated by one card_type (catches '12 of 13 Fusion'-style failures)", () => {
  // Every fixture defined in this file (the original suite's cards
  // plus every fixture above), scored through the live engine. This
  // is a small hand-built stand-in for the real ~8,954-card
  // format_eligible pool - not a claim that these proportions match
  // production, only that Legendary, once reached by more than a
  // couple of cards, must not collapse back into single-card_type
  // domination the way the pre-recalibration engine did (12 of 13 =
  // 92% Fusion).
  const allFixtures = cards.concat([
    CATACLYSM_SENTINEL, ABSOLUTE_RECKONING, ABSOLUTE_VERDICT, UTOPIC_ASCENSION_DRAGON,
    ABSOLUTE_NEMESIS_DRAGON, RADIANT_CATACLYSM_OVERLORD, CHRONOVOID_APOCALYPSE_DRAGON,
    TWIN_TEST_ALPHA_MAIN_DECK, TWIN_TEST_BETA_FUSION, MEDIOCRE_FUSION_BEATER,
  ]);
  const cardTypeByName = new Map(allFixtures.map((c) => [c.name, c.card_type]));

  const legendaryNames = Array.from(results.entries())
    .filter(([, r]) => r.rarity === "Legendary")
    .map(([name]) => name);
  assert.ok(
    legendaryNames.length >= 4,
    `expected this mixed pool's fixtures to include several Legendary-caliber cards across different profiles, got ${legendaryNames.length}`
  );

  function bucketOf(cardType) {
    const ct = (cardType || "").toLowerCase();
    if (ct.includes("fusion")) return "Fusion";
    if (ct.includes("xyz")) return "Xyz";
    if (ct.includes("synchro")) return "Synchro";
    if (ct.includes("link")) return "Link";
    if (ct.includes("spell")) return "Spell";
    if (ct.includes("trap")) return "Trap";
    if (ct.includes("monster")) return "MainDeckMonster";
    return "Other";
  }

  const counts = new Map();
  for (const name of legendaryNames) {
    const bucket = bucketOf(cardTypeByName.get(name));
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const legendaries = legendaryNames;
  const maxCount = Math.max(...counts.values());
  const maxShare = maxCount / legendaries.length;
  assert.ok(
    maxShare <= 0.5,
    `expected no single card_type bucket to exceed 50% of Legendary proposals, got ${JSON.stringify(Object.fromEntries(counts))} (${(maxShare * 100).toFixed(0)}% max share)`
  );

  // Directly re-checks the exact historical failure mode: Fusion
  // specifically must not be the majority.
  const fusionShare = (counts.get("Fusion") ?? 0) / legendaries.length;
  assert.ok(fusionShare <= 0.5, `expected Fusion to not dominate Legendary proposals, got ${(fusionShare * 100).toFixed(0)}%`);

  // At least one non-monster (Spell/Trap) Legendary must exist -
  // directly re-checks the "zero Spell/Trap Legendary candidates
  // despite strong scores" sanity flag from the recalibration spec.
  const hasSpellOrTrap = (counts.get("Spell") ?? 0) + (counts.get("Trap") ?? 0) > 0;
  assert.ok(hasSpellOrTrap, "expected at least one Spell or Trap Legendary candidate in this mixed pool");
});

console.log("\n--- Card context classification (2026-08-30) ---\n");

test("Red-Eyes Dark Dragoon: functional archetype lock -> 'archetype' context", () => {
  assert.equal(results.get("Red-Eyes Dark Dragoon").contextResult.context, "archetype");
});

test("Blue-Eyes Ultimate Spirit Dragon: functional archetype lock -> 'archetype' context", () => {
  assert.equal(results.get("Blue-Eyes Ultimate Spirit Dragon").contextResult.context, "archetype");
});

test("Baronne de Fleur: thematic-only archetype tag + broadly usable -> 'splashable_engine', NOT 'archetype'", () => {
  // This is the exact real-world failure mode classifyCardContext
  // exists to catch: a card that WEARS an archetype tag ("Fleur")
  // but has fully generic Fusion materials and no real functional
  // requirement - the same root-cause pattern the v2 engine rewrite
  // was triggered by in the first place (see this file's header).
  assert.equal(results.get("Baronne de Fleur").contextResult.context, "splashable_engine");
});

test("Forbidden Droplet: thematic-only archetype tag + broadly usable -> 'splashable_engine'", () => {
  assert.equal(results.get("Forbidden Droplet").contextResult.context, "splashable_engine");
});

test("Giant Trunade: no archetype tag, broadly usable -> honest 'generic', not disguised as archetype support", () => {
  assert.equal(results.get("Giant Trunade").contextResult.context, "generic");
});

test("Harpie's Feather Duster: thematic-only tag + broadly usable -> 'splashable_engine' (same pattern as Baronne/Droplet, different card_type)", () => {
  assert.equal(results.get("Harpie's Feather Duster").contextResult.context, "splashable_engine");
});

test("Codex calibration cards: context labels track the brief's own qualitative reasoning for each card", () => {
  // Not a coincidence this session is claiming - this is exactly why
  // the classifier is worth having: it independently reproduces, from
  // structural signals alone, distinctions a human reviewer already
  // made in prose (see the Codex brief's per-card reasoning for each
  // of these). Where a card's real value is situational/matchup-
  // dependent/defensive rather than broadly active, "narrow_support"
  // is the expected, correct label - it is NOT a claim that these
  // cards are weak, only that they are not GENERICALLY strong in the
  // way Giant Trunade or Harpie's Feather Duster are.
  const expected = {
    'Maxx "C"': "narrow_support",
    "Effect Veiler": "generic",
    Tragoedia: "generic",
    "Gorz the Emissary of Darkness": "narrow_support",
    "Battle Fader": "narrow_support",
    "Swift Scarecrow": "narrow_support",
    "D.D. Crow": "narrow_support",
    "Giant Trunade": "generic",
    "Rescue Rabbit": "narrow_support",
  };
  for (const [name, expectedContext] of Object.entries(expected)) {
    const r = results.get(name);
    assert.equal(
      r.contextResult.context,
      expectedContext,
      `${name}: expected context "${expectedContext}", got "${r.contextResult.context}"`
    );
  }
});

console.log("\n--- Codex calibration comparison (2026-08-30) ---\n");

// APPROVED_CALIBRATION mirrors the Codex brief's own reference table
// verbatim (section 71). This is the single source of truth this
// block compares the engine's CURRENT output against - if a future
// engine change moves one of these off its documented current value,
// this test will need a deliberate update, which is the point: it
// forces a human to notice and re-decide, rather than silently
// drifting further from (or coincidentally back toward) the
// approved table.
const APPROVED_CALIBRATION = {
  'Maxx "C"': "Ultra Rare",
  "Effect Veiler": "Secret Rare",
  Tragoedia: "Secret Rare",
  "Gorz the Emissary of Darkness": "Secret Rare",
  "Battle Fader": "Ultra Rare",
  "Swift Scarecrow": "Super Rare",
  "D.D. Crow": "Ultra Rare",
  "Giant Trunade": "Ultra Rare",
  "Rescue Rabbit": "Super Rare",
};

test("Codex calibration cards: document current engine output for each (regression pin, not a correctness claim)", () => {
  // CURRENT_ENGINE_OUTPUT is what scoreCard/proposeRarity actually
  // compute AS OF the four 2026-08-30 fixes above, verified by
  // running this exact file with plain `node`. Every single one of
  // the 9 approved cards lands 1-2 rarity tiers BELOW its approved
  // value - see the KNOWN REMAINING GAP comment above the fixtures
  // for why (reactive/hand-trap value the card's own text can't
  // state), and the cardpool balance audit report for the
  // recommendation (valuation_manually_overridden + a direct
  // game_rarity set for this whole calibration table, not further
  // engine tuning).
  const CURRENT_ENGINE_OUTPUT = {
    'Maxx "C"': "Rare",
    "Effect Veiler": "Ultra Rare",
    Tragoedia: "Ultra Rare",
    "Gorz the Emissary of Darkness": "Super Rare",
    "Battle Fader": "Rare",
    "Swift Scarecrow": "Normal",
    "D.D. Crow": "Normal",
    "Giant Trunade": "Super Rare",
    "Rescue Rabbit": "Normal",
  };

  let underCount = 0;
  let matchCount = 0;
  for (const [name, approved] of Object.entries(APPROVED_CALIBRATION)) {
    const r = results.get(name);
    assert.ok(r, `missing fixture/result for calibration card "${name}"`);
    assert.equal(
      r.rarity,
      CURRENT_ENGINE_OUTPUT[name],
      `${name}: expected the documented current-engine value "${CURRENT_ENGINE_OUTPUT[name]}", got "${r.rarity}" - the engine's behavior for this card changed; re-run the full calibration comparison and update either this pin (if the change is an improvement) or investigate a regression`
    );
    const approvedRank = RARITY_ORDER.indexOf(approved);
    const currentRank = RARITY_ORDER.indexOf(r.rarity);
    if (currentRank === approvedRank) matchCount++;
    else if (currentRank < approvedRank) underCount++;
  }

  console.log(`  ${matchCount}/${Object.keys(APPROVED_CALIBRATION).length} calibration cards currently match the approved table exactly.`);
  console.log(`  ${underCount}/${Object.keys(APPROVED_CALIBRATION).length} are currently UNDER-rated relative to the approved table (0 are over-rated).`);
});

test("Codex calibration: none of the 9 approved cards are over-rated by the current engine (the gap only runs one direction)", () => {
  for (const [name, approved] of Object.entries(APPROVED_CALIBRATION)) {
    const r = results.get(name);
    const approvedRank = RARITY_ORDER.indexOf(approved);
    const currentRank = RARITY_ORDER.indexOf(r.rarity);
    assert.ok(
      currentRank <= approvedRank,
      `${name}: engine says "${r.rarity}" which is ABOVE the approved "${approved}" - this would be a new, different kind of miscalibration (over-rating) worth investigating on its own`
    );
  }
});

// =========================================================
// 2026-08-30 HUMAN CALIBRATION PASS (ROUND 2) - "HUMAN CALIBRATION
// CALIBRATION SET" fixtures.
//
// The brief supplied 58 new human-approved rarity classifications
// (real, well-known TCG cards) as calibration examples for the
// general reusable scoring changes made this round (material-count/
// specificity-aware accessibility, tightened Legendary ceiling-only
// escape, immediate-impact, randomness, single-use, heavy-tribute-
// cost signals - see the corresponding 2026-08-30 comments in
// valuation-engine.mjs). Per the SAME honesty note at the top of this
// file, this sandbox has no live catalog/network access, so only the
// 8 cards below - chosen specifically because their real oracle text
// is well-known and high-confidence - were built into full fixtures.
// The other ~50 cards in the brief's list are NOT guessed at here
// (fabricating oracle text for cards this session isn't confident
// about would produce fake evidence, which is worse than no evidence)
// - see the audit report's REVIEW CANDIDATES section for the
// mechanical jq recipe that runs the real, full comparison against
// live per-card.json once the user re-runs the catalog audit.
// =========================================================

// Confidence: HIGH. Attribute-CONSTRAINED (not named) Fusion
// materials ("1 LIGHT monster + 1 DARK monster") - this is the
// positive case proving the tightened Legendary ceiling->=9.9 escape
// (dependency <= 4.0) still admits a genuinely exceptional card whose
// materials are constrained rather than named. Human: LEGENDARY.
const LIGHT_AND_DARKNESS_DRAGON = {
  name: "Light and Darkness Dragon",
  card_type: "Fusion Monster",
  frame_type: "fusion",
  archetype: null,
  atk: 2800,
  def: 2400,
  description:
    "1 LIGHT monster + 1 DARK monster\nThis card gains ATK/DEF equal to the total ATK/DEF of all monsters on the field. If a Spell Card, Trap Card, or monster effect is activated (Quick Effect): You can pay 500 Life Points; negate the activation, and if you do, destroy that card, also this card loses 500 ATK/DEF. If this card would return to its original ATK/DEF, it is destroyed instead.",
};

// Confidence: HIGH on the core mechanic (cannot be Normal/Special
// Summoned except by Tributing 2 monsters, then a further 2-Tribute
// board wipe). Tests the new heavy-tribute-cost signal. Human: SECRET
// RARE - "do not equate big stats/spectacular boss monster with
// Legendary" applies directly (4000/4000 stats, board-wipe effect,
// still not Legendary because of the double-Tribute cost).
const OBELISK_THE_TORMENTOR = {
  name: "Obelisk the Tormentor",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  atk: 4000,
  def: 4000,
  description:
    "This card cannot be Normal Summoned or Set. This card cannot be Special Summoned, except by Tributing 2 monsters. This card cannot attack the turn this effect is activated. You can Tribute 2 monsters; destroy all monsters your opponent controls, then inflict 2000 damage to your opponent for each monster destroyed by this effect. This card cannot be used as a Fusion, Synchro, Xyz, or Link Material, or as a Tribute for a Tribute Summon.",
};

// Confidence: MODERATE-HIGH on the core mechanic (banish-to-Special-
// Summon cost, negates+banishes a Special Summoned monster's effect).
// Human: SECRET RARE - matches the brief's OWN worked example for
// Jowgen the Spiritualist below almost exactly ("value depends
// heavily on Special Summons; Special Summoning is less frequent in
// this format").
const DOOMCALIBER_KNIGHT = {
  name: "Doomcaliber Knight",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  atk: 1900,
  def: 1000,
  description:
    "You can only Special Summon this card by banishing 1 DARK monster from your Graveyard. Once per turn, when a Special Summoned monster's effect is activated: You can banish this card from the field; negate the activation, and if you do, banish that monster.",
};

// Confidence: HIGH. Generic 1-Tribute beatstick with a real but
// unspectacular effect (double attack, response-proof). Human: ULTRA
// RARE - the positive control for "big stats + moderate effect,
// ordinary accessibility -> Ultra, not Secret/Legendary."
const ANCIENT_GEAR_BEAST = {
  name: "Ancient Gear Beast",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: "Ancient Gear",
  atk: 3000,
  def: 3000,
  description:
    "This card can attack twice during each Battle Phase. Your opponent cannot activate Spell or Trap Cards in response to this card's attack.",
};

// Confidence: MODERATE on exact wording, HIGH on the core mechanic
// (an extremely narrow "banish 1 monster of each of 7 different
// Attributes from your GY" alternate Special Summon condition - the
// distinctAttributesRequired signal's whole reason for existing).
// Human: SECRET RARE - a genuine build-around payoff whose narrow
// condition does not disqualify it the way it would for a text-only
// score (KNOWN REMAINING GAP: this card's ceiling gets no "genuine
// build-around payoff" credit the way an archetype-tagged or
// optional-bonus card would, because its payoff is a hard alternate-
// summon CONDITION rather than either of those two shapes - see the
// audit report's systematic-errors section. Left as a manual override
// rather than adding a third ceiling-bonus shape for a handful of
// real cards.)
const RAINBOW_DRAGON = {
  name: "Rainbow Dragon",
  card_type: "Fusion Monster",
  frame_type: "fusion",
  archetype: null,
  atk: 4000,
  def: 4000,
  description:
    '1 LIGHT Dragon-Type Fusion Monster + 1 "Black Luster Soldier"\nYou can banish 1 LIGHT, DARK, WATER, FIRE, EARTH, WIND and DIVINE Attribute monster from your Graveyard; Special Summon this card. Once per turn: You can banish 1 monster your opponent controls, then, for each monster banished by this effect, this card gains 1000 ATK.',
};

// Confidence: MODERATE on exact wording, HIGH on the core mechanic (a
// slow, repeatable Graveyard-Spell-recursion engine with no removal/
// draw/protection of its own). Human: SECRET RARE - a "quiet value
// engine" case: real long-game advantage that text-only power scoring
// structurally can't see, the same known gap the ORIGINAL 9-card
// calibration table already established for hand traps (see the
// "Codex calibration comparison" section above) - not a new finding,
// a second confirmation of it. archetype tag is "Dark Magician"
// (thematic-only here, correctly classified splashable_engine below)
// - a good real example of getArchetypeRelevanceHint() surfacing a
// high-nostalgia archetype on a card the automated score badly
// undervalues.
const SORCERER_OF_DARK_MAGIC = {
  name: "Sorcerer of Dark Magic",
  card_type: "Fusion Monster",
  frame_type: "fusion",
  archetype: "Dark Magician",
  atk: 2600,
  def: 1700,
  description:
    "1 Spellcaster-Type monster + 1 Spell Card\nOnce per turn, during your Main Phase: You can add 1 Spell Card from your Graveyard to your hand.",
};

// Confidence: MODERATE on exact wording, HIGH on the core mechanic (a
// repeatable once-per-turn Special Summon engine for its Type group).
// Human: SECRET RARE - the same "quiet value engine" gap as Sorcerer
// of Dark Magic above.
const SUPERANCIENT_DEEPSEA_KING_COELACANTH = {
  name: "Superancient Deepsea King Coelacanth",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  atk: 1800,
  def: 1200,
  description:
    'Once per turn, you can Special Summon 1 Fish, Sea Serpent, or Aqua-Type monster from your Deck in Attack Position, except "Superancient Deepsea King Coelacanth".',
};

// Confidence: HIGH - this exact card and reasoning are given verbatim
// in the calibration brief itself (section 5). Human: SECRET RARE,
// explicitly "not Legendary" per the brief's own worked reasoning.
const JOWGEN_THE_SPIRITUALIST = {
  name: "Jowgen the Spiritualist",
  card_type: "Effect Monster",
  frame_type: "effect",
  archetype: null,
  atk: 700,
  def: 500,
  description:
    "Once per turn, when your opponent Special Summons a monster(s): You can send this face-up card from the field to the Graveyard; destroy all monsters your opponent controls that were Special Summoned. This card cannot attack the turn after you activate this effect.",
};

const HUMAN_CALIBRATION_ROUND2 = {
  "Light and Darkness Dragon": "Legendary",
  "Obelisk the Tormentor": "Secret Rare",
  "Doomcaliber Knight": "Secret Rare",
  "Ancient Gear Beast": "Ultra Rare",
  "Rainbow Dragon": "Secret Rare",
  "Sorcerer of Dark Magic": "Secret Rare",
  "Superancient Deepsea King Coelacanth": "Secret Rare",
  "Jowgen the Spiritualist": "Secret Rare",
};

for (const card of [
  LIGHT_AND_DARKNESS_DRAGON,
  OBELISK_THE_TORMENTOR,
  DOOMCALIBER_KNIGHT,
  ANCIENT_GEAR_BEAST,
  RAINBOW_DRAGON,
  SORCERER_OF_DARK_MAGIC,
  SUPERANCIENT_DEEPSEA_KING_COELACANTH,
  JOWGEN_THE_SPIRITUALIST,
]) {
  const r = evaluate(card);
  results.set(card.name, r);
  printResult(card, r);
}

test("Light and Darkness Dragon: constrained (not named) materials still reach Legendary via the tightened ceiling escape", () => {
  const r = results.get("Light and Darkness Dragon");
  assert.equal(r.signals.materials.specificity, "constrained");
  assert.ok(r.scores.dependency <= 4.0, `expected dependency to stay under the ceiling-escape cutoff, got ${r.scores.dependency}`);
  assert.equal(r.rarity, "Legendary");
});

test("Ancient Gear Beast: generic 1-Tribute beatstick lands Ultra Rare, not Secret/Legendary", () => {
  const r = results.get("Ancient Gear Beast");
  assert.equal(r.rarity, "Ultra Rare");
});

test("Obelisk the Tormentor: new heavy-tribute-cost signal fires (2-Tribute Summon, then a further 2-Tribute effect)", () => {
  const r = results.get("Obelisk the Tormentor");
  assert.equal(r.signals.tributeCount, 2, `expected the tribute-count parser to find 2, got ${r.signals.tributeCount}`);
  assert.notEqual(r.rarity, "Legendary", `expected NOT Legendary despite 4000/4000 stats and a board wipe, got ${r.rarity}`);
});

test("HUMAN CALIBRATION ROUND 2: document current post-improvement engine output for each of the 8 verified cards", () => {
  const CURRENT_ENGINE_OUTPUT_ROUND2 = {
    "Light and Darkness Dragon": "Legendary",
    "Obelisk the Tormentor": "Ultra Rare",
    "Doomcaliber Knight": "Super Rare",
    "Ancient Gear Beast": "Ultra Rare",
    "Rainbow Dragon": "Normal",
    "Sorcerer of Dark Magic": "Normal",
    "Superancient Deepsea King Coelacanth": "Rare",
    "Jowgen the Spiritualist": "Ultra Rare",
  };

  let matchCount = 0;
  let nearCount = 0;
  let missCount = 0;
  for (const [name, approved] of Object.entries(HUMAN_CALIBRATION_ROUND2)) {
    const r = results.get(name);
    assert.ok(r, `missing fixture/result for calibration card "${name}"`);
    assert.equal(
      r.rarity,
      CURRENT_ENGINE_OUTPUT_ROUND2[name],
      `${name}: expected the documented current-engine value "${CURRENT_ENGINE_OUTPUT_ROUND2[name]}", got "${r.rarity}" - re-run the calibration comparison and update this pin (or investigate a regression)`
    );
    const approvedRank = RARITY_ORDER.indexOf(approved);
    const currentRank = RARITY_ORDER.indexOf(r.rarity);
    const gap = Math.abs(currentRank - approvedRank);
    if (gap === 0) matchCount++;
    else if (gap === 1) nearCount++;
    else missCount++;
  }
  console.log(`\n  HUMAN CALIBRATION ROUND 2 (8 verified cards): ${matchCount} MATCH, ${nearCount} NEAR (adjacent tier - Obelisk the Tormentor, Jowgen the Spiritualist - left to the engine, not overridden), ${missCount} MISS (2+ tiers off).`);
  console.log(`  MISS cards (recommended manual overrides, same doctrine as the original 9): Doomcaliber Knight, Rainbow Dragon, Sorcerer of Dark Magic, Superancient Deepsea King Coelacanth.`);
});

console.log(`\n${passed} passed, ${failed} failed (of ${passed + failed})`);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.err.message}`);
  }
  process.exit(1);
}
process.exit(0);
