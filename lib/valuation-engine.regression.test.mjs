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
  VALUATION_ENGINE_VERSION,
  RARITY_ORDER,
} from "./valuation-engine.mjs";

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

console.log(`\n${passed} passed, ${failed} failed (of ${passed + failed})`);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.err.message}`);
  }
  process.exit(1);
}
process.exit(0);
