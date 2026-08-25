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
  return { signals, scores, rarity };
}

function printResult(card, r) {
  console.log(`\n=== ${card.name} ===`);
  console.log(
    `  power=${r.scores.power} accessibility=${r.scores.accessibility} dependency=${r.scores.dependency} ` +
      `genericUtility=${r.scores.genericUtility} consistency=${r.scores.consistency} floor=${r.scores.floor} ` +
      `ceiling=${r.scores.ceiling} oppressiveness=${r.scores.oppressiveness} draftValue=${r.scores.draftValue} ` +
      `-> ${r.rarity}`
  );
  console.log(`  reason: ${r.scores.reason}`);
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

// Path B - a genuine "exceptional build-around" Fusion (Design
// Target B): NAMED materials (real dependency, +3.5), but the effect
// is strong enough that floor/genericUtility/accessibility all still
// clear the gate - contrast with Chronovoid Apocalypse Dragon below,
// which has a comparable ceiling but fails on exactly these axes.
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

test("Radiant Cataclysm Overlord: exceptional build-around Fusion (named materials) reaches Legendary via Path B", () => {
  const r = results.get("Radiant Cataclysm Overlord");
  assert.equal(r.signals.materials.specificity, "named", `expected named Fusion materials, got ${r.signals.materials.specificity}`);
  assert.ok(r.scores.dependency >= 3, `expected a real dependency penalty from named materials, got ${r.scores.dependency}`);
  assert.ok(r.scores.floor >= 4.5, `expected floor to still clear the build-around bar despite named materials, got ${r.scores.floor}`);
  assert.equal(r.rarity, "Legendary", `expected Legendary, got ${r.rarity}`);
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

console.log(`\n${passed} passed, ${failed} failed (of ${passed + failed})`);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.err.message}`);
  }
  process.exit(1);
}
process.exit(0);
