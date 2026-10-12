// scripts/cardpool/rank-corrections.mjs
//
// Small, documented CORRECTION LAYER on top of lib/valuation-engine.mjs
// for the v2 Classic ranking (scripts/cardpool/rank-pool.mjs).
//
// Why: the engine reads what a card does once it resolves. It has no
// idea that a card which works FROM THE HAND on the OPPONENT'S turn is
// worth more than its resolved effect suggests, or that a cheap,
// unrestricted revive / removal spell is a staple in every deck. All 9
// of the original human-calibration cards (Maxx "C", Effect Veiler,
// Tragoedia, Gorz, Battle Fader, Swift Scarecrow, D.D. Crow, Giant
// Trunade, Rescue Rabbit) were rated lower by the engine than by
// humans, and they are almost all of that shape.
//
// How: four tags, each a plain phrase match on the card's OWN text,
// each adding a small fixed bonus. The engine itself is not changed
// (its regression suite pins its current output), and the engine's
// text-based `dependency` score gates every tag: a card that the
// engine already sees as locked to specific other cards (dependency >
// DEPENDENCY_CAP) gets no bonus. There is deliberately NO archetype
// tag or archetype-name check anywhere in here - that regression is
// exactly what forced the engine's v2 rewrite.
//
//   hand_trap        - a monster you use from the hand (discard / send
//                      / Special Summon / banish this card from the
//                      hand) on the opponent's turn or as a reaction.
//   comeback         - a card that switches on when you are behind:
//                      you took damage, a direct attack is declared,
//                      you control no cards, the opponent controls
//                      more / only they control monsters.
//   generic_revive   - Special Summon any monster from a Graveyard,
//                      no Type / Attribute / name lock.
//   generic_removal  - a Spell/Trap that removes, steals or flips 1
//                      opposing card/monster, or negates a Summon /
//                      activation, with no lock on what it can hit.
//
// The bonus goes on draftValue and (doubled) on ceiling, because the
// engine's Secret Rare gate also needs ceiling >= 6.0 - a hand trap's
// best case is "it stopped the opponent's whole turn", which the
// engine's ceiling never sees.

export const CORRECTION_LAYER_VERSION = "2026-10-12.1";

export const DEPENDENCY_CAP = 3.0;
export const MAX_TOTAL_BONUS = 0.7;

export const TAG_BONUS = {
  hand_trap: 0.45,
  comeback: 0.25,
  generic_revive: 0.35,
  generic_removal: 0.3,
};

const HAND_USE =
  /(?:discard this card|send this card from your hand|special summon this card from your hand|banish this card from your hand|reveal this card in your hand)/i;

const REACTIVE_TIMING =
  /(?:during (?:your opponent's|either player's) (?:turn|main phase|battle phase|standby phase|end phase)|quick effect|when (?:your opponent|an opponent's monster|you take|a monster you control|a card or effect)|if you take|declares? an? (?:direct )?attack|damage calculation|opponent's turn)/i;

const COMEBACK =
  /(?:(?:when|if) you take (?:battle |effect )?damage|declares a direct attack|you (?:must )?control no cards|if you control no (?:cards|monsters)|while you control no (?:cards|monsters)|if your opponent controls (?:more|2 or more) monsters|if only your opponent controls a monster|if your opponent controls a monster and you control no monsters|your (?:LP|life points) (?:are|is) lower)/i;

const GENERIC_REVIVE =
  /(?:target 1 monster in (?:either|your|your opponent's) (?:GY|Graveyard)[^.]*special summon|special summon 1 monster from (?:either|your|your opponent's) (?:GY|Graveyard)|target 1 monster in (?:either|your) (?:GY|Graveyard); special summon)/i;

const REMOVAL_TARGET =
  /(?:target|choose|select) 1 (?:card|monster|face-up monster|face-down card|spell\/trap(?: card)?|spell or trap card)[^.;]*(?:on the field|your opponent controls)/i;

const REMOVAL_PAYOFF =
  /(?:destroy (?:that|it|the)|banish (?:that|it)|return (?:that|it)[^.]*to the hand|take control|face-down defense position|shuffle (?:that|it) into the deck)/i;

const SUMMON_NEGATION =
  /(?:negate the (?:summon|activation)|when your opponent (?:normal |special |flip )?summons? (?:a|1) monster[^.]*(?:destroy|banish|return))/i;

// A Type / Attribute / Level / archetype-name LOCK on what the card
// may hit or revive. Quoted names are a lock too ("Special Summon 1
// "Blue-Eyes White Dragon" from your GY").
const TARGET_LOCK =
  /(?:\b(?:LIGHT|DARK|WATER|FIRE|EARTH|WIND|DIVINE)\b|-Type\b|level \d+ or (?:lower|higher)|"[^"]+" monster)/;

// Quoted card names other than the card's own ("You can only use this
// effect of "X" once per turn") mean the card needs specific other cards.
export function hasForeignQuote(text, ownName) {
  const own = String(ownName ?? "");

  return (String(text ?? "").match(/"[^"]+"/g) ?? []).some(
    (q) => q.slice(1, -1) !== own && !own.startsWith(`${q.slice(1, -1)} "`)
  );
}

function sentences(text) {
  return String(text ?? "")
    .split(/(?<=\.)\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isMonsterType(type) {
  return /monster/i.test(type ?? "");
}

function isSpellOrTrap(type) {
  return /spell|trap/i.test(type ?? "");
}

// card: card_catalog-shaped row (card_type, description). scores: the
// engine's scoreCard() output for that card.
export function correctionTags(card, scores) {
  const tags = [];

  if (scores.dependency > DEPENDENCY_CAP) {
    return tags;
  }

  const type = card.card_type ?? "";
  const parts = sentences(card.description);
  const text = parts.join(" ");

  if (
    isMonsterType(type) &&
    !/fusion|xyz|synchro|link/i.test(type) &&
    parts.some((s) => HAND_USE.test(s) && REACTIVE_TIMING.test(s))
  ) {
    tags.push("hand_trap");
  }

  if (parts.some((s) => COMEBACK.test(s))) {
    tags.push("comeback");
  }

  const needsOtherCards = hasForeignQuote(text, card.name) || /xyz monster you control|detach|xyz material/i.test(text);

  if (!needsOtherCards && parts.some((s) => GENERIC_REVIVE.test(s) && !TARGET_LOCK.test(s))) {
    tags.push("generic_revive");
  }

  if (
    isSpellOrTrap(type) &&
    !needsOtherCards &&
    parts.some(
      (s) =>
        ((REMOVAL_TARGET.test(s) && REMOVAL_PAYOFF.test(s)) || SUMMON_NEGATION.test(s)) &&
        !TARGET_LOCK.test(s)
    ) &&
    // A card whose activation itself needs a Type/name/archetype setup
    // is not "generic" removal, even if the removal clause is clean.
    !/(?:if|while) you control (?:a|an|1|2|3) (?:"|[A-Z]+ |\w+-Type)/.test(text)
  ) {
    tags.push("generic_removal");
  }

  return tags;
}

export const TAG_LABELS = {
  hand_trap: "used from the hand on the opponent's turn (hand trap)",
  comeback: "turns on when you are behind (comeback card)",
  generic_revive: "revives any monster, no lock",
  generic_removal: "generic removal / negation, no lock",
};

export function applyCorrections(card, scores) {
  const tags = correctionTags(card, scores);
  const bonus = Math.min(
    MAX_TOTAL_BONUS,
    tags.reduce((sum, tag) => sum + TAG_BONUS[tag], 0)
  );
  const round2 = (n) => Math.round(n * 100) / 100;

  return {
    tags,
    bonus: round2(bonus),
    scores: {
      ...scores,
      draftValue: round2(scores.draftValue + bonus),
      ceiling: round2(Math.min(10, scores.ceiling + bonus * 2)),
      floor: round2(Math.min(10, scores.floor + bonus)),
    },
  };
}
