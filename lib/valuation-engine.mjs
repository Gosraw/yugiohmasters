// =========================================================
// DUELIST CIRCLE CARD VALUATION ENGINE (v2)
//
// Deterministic, explainable, reusable card-understanding
// primitives. Given a card_catalog-shaped row, produces EIGHT
// separate scores (0-10 each) plus a human-readable reason
// string - never a single black-box number.
//
// v2 REWRITE - why this file changed shape entirely:
//
// The v1 engine (see git history / VALUATION_ENGINE_VERSION
// "2026-08-23.1") folded "how hard is this to use" and "how
// much does this depend on other specific cards" into a single
// blended usability/versatility/dependency trio, and inferred
// archetype dependency mostly from whether card.archetype (a
// database TAG, not a functional requirement) happened to
// appear inside the card's own text. A real run against the
// live catalog found concrete failures:
//
//   - Forbidden Droplet (archetype tag "Forbidden", but a fully
//     generic, non-archetype Quick-Play Spell) was scored as if
//     it needed "Forbidden" support.
//   - Baronne de Fleur's Fusion Materials line ("1 Fusion,
//     Synchro, or Xyz Monster, plus 1 non-Tuner monster" - no
//     name, no archetype, no Attribute/Type lock at all) fell
//     through v1's too-narrow "generic materials" regex into a
//     "moderate dependency" bucket with NO explanation attached
//     - a confirmed, code-level bug (see git log for the exact
//     regex and why it missed this phrasing).
//   - Draining Shield / Negate Attack / Scrap-Iron Scarecrow
//     converged to near-identical scores because v1's
//     `removalNegate` signal treated "negate the attack" (a
//     narrow, Battle-Phase-only, defense-only effect) exactly
//     the same as "negate the activation/effect" (a broadly
//     powerful, always-relevant effect) - a second confirmed,
//     code-level bug.
//
// v2 fixes the ROOT CAUSE, not just these four cards: dependency
// is now driven ENTIRELY by classifying what a card's own text
// ACTUALLY requires (see classifyReference() below), never by
// whether a database archetype tag happens to match a substring.
// A card's archetype tag is only ever used to (a) explain, in
// plain language, whether that tag is functionally load-bearing
// or purely thematic, and (b) judge how narrow a SEARCH target is
// (see searchNarrow) - never to directly penalize the card
// itself. Extra Deck material parsing was rewritten to
// distinguish "generic" (any monster/count-based condition),
// "constrained" (Attribute/Type/Tuner-locked but not named), and
// "named" (a specific card required) - matching what the game
// itself actually enforces, not a narrow regex shape.
//
// The eight axes (Season 1 spec, letters A-H):
//   power          (A) - raw strength of the resolved effect,
//                    independent of how hard it is to enable.
//   accessibility  (B) - how easy the card is to summon/activate
//                    on its own terms (cost, timing, Set
//                    requirement, Extra Deck board-presence
//                    tax) - NOT whether the deck happens to have
//                    the right support (that's dependency's job).
//   dependency     (C) - what OTHER specific cards/materials/
//                    archetypes this card actually, functionally
//                    requires. HIGHER dependency = WORSE for
//                    random draft value. Built from
//                    classifyReference(), never from a bare
//                    archetype-tag match.
//   genericUtility (D) - can almost any random Duelist Circle
//                    deck use this effectively.
//   consistency    (E) - how reliably the useful effect is LIVE
//                    once you have this card (timing windows,
//                    needing a target to exist, Set-first delay).
//   floor          (F) - guaranteed value with ZERO synergy/setup
//                    - what you get if you just own this card and
//                    nothing else lines up. Archetype payoffs and
//                    hard-condition cards have a low floor even
//                    when their ceiling is high.
//   ceiling        (G) - best-case value when fully enabled/
//                    supported. Archetype/build-around cards are
//                    explicitly ALLOWED a high ceiling - a real
//                    payoff justifies real excitement, dependency
//                    is a penalty on draftValue, not a death
//                    sentence on ceiling.
//   oppressiveness (H) - how problematic the card is specifically
//                    in a SMALL, LOW-POWER starting card pool.
//                    Deliberately kept OUT of draftValue entirely
//                    (see scoreCard) - "a card can be extremely
//                    desirable AND unsuitable for Season 1" is a
//                    release_stage decision, not a rarity one.
//   draftValue     - the actual output: how valuable it is to be
//                    RANDOMLY offered this card, from floor/
//                    ceiling/accessibility/genericUtility/
//                    consistency, minus a dependency penalty.
//                    This is what proposed_game_rarity is based
//                    on, NOT raw power alone and NOT
//                    oppressiveness.
//
// Nothing here calls an AI/LLM. Every signal is a plain
// keyword/phrase/clause match against the card's own real text
// and fields - reproducible, auditable, and safe to re-run
// against the full catalog at any time. This is still, honestly,
// a RULE-BASED system: it cannot achieve true natural-language
// understanding of arbitrary card text, and the regression suite
// (lib/valuation-engine.regression.test.mjs) exists specifically
// to keep catching cases where the rules fall short, the way this
// rewrite itself was triggered by exactly that kind of review.
// =========================================================

const RARITY_ORDER = [
  "Normal",
  "Rare",
  "Super Rare",
  "Ultra Rare",
  "Secret Rare",
  "Legendary",
];

// ---------------------------------------------------------
// Basic type/frame helpers (unchanged from v1 - these were
// never part of the reported problem)
// ---------------------------------------------------------

function isExtraDeckType(cardType) {
  const t = (cardType || "").toLowerCase();
  return {
    fusion: t.includes("fusion"),
    synchro: t.includes("synchro"),
    xyz: t.includes("xyz"),
    link: t.includes("link"),
    pendulum: t.includes("pendulum"),
  };
}

function isMonster(cardType) {
  return (cardType || "").toLowerCase().includes("monster");
}

function isSpell(cardType) {
  return (cardType || "").toLowerCase().includes("spell");
}

function isTrap(cardType) {
  return (cardType || "").toLowerCase().includes("trap");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------
// Reference classification - THE core of the rewrite.
//
// Finds every quoted card-name-shaped reference in a card's own
// text ("Blue-Eyes White Dragon", 'Fleur', etc.) and classifies
// the ROLE that reference plays, using the surrounding clause,
// into exactly the taxonomy the Season 1 review asked for:
//
//   mandatory_requirement - the card literally cannot be
//     summoned/activated without this ("cannot be Special
//     Summoned except...", "cannot be activated unless you
//     control...").
//   mandatory_target - the effect must target this specific
//     reference to do anything ("target 1 'X'"), and there is no
//     "or" alternative offered.
//   alternative_effect - same as mandatory_target/search, but an
//     "or" gives a real choice, so the requirement is much softer.
//   optional_bonus - an "if you control a 'X', you can
//     additionally..." clause - the card fully functions without
//     it, this only adds upside.
//   search_target - the card ADDS this reference to your hand
//     (a search) rather than requiring you to already have it.
//     Narrows what the search is useful for, but is not a
//     dependency on the searching card itself.
//   self_reference - the quoted term is the card's own name
//     (hard-once-per-turn text almost always does this) - not a
//     dependency at all.
//   thematic_name_only - card.archetype exists but never actually
//     appears as a functional reference above; the tag is a
//     database grouping label, not something the card's own text
//     requires.
//   ambiguous_reference - a quoted reference was found but did not
//     match a confident pattern above. Treated as a WEAK signal
//     (not a severe one) and surfaced explicitly in the reason
//     text and audit report, rather than silently assumed to be
//     either extreme.
// ---------------------------------------------------------

function extractQuotedReferences(text) {
  const refs = [];
  const re = /["“]([^"”]{2,60})["”]/g;
  let m;
  while ((m = re.exec(text))) {
    refs.push({ term: m[1].trim(), index: m.index });
  }
  return refs;
}

// Returns the sentence/clause containing `index` - bounded by the
// nearest '.', ';', or line break on either side. This is what
// lets us classify a reference by its own local grammar instead
// of the whole card's text at once.
function clauseAround(text, index) {
  const boundary = /[.;\n]/g;
  let start = 0;
  let end = text.length;
  boundary.lastIndex = 0;
  let m;
  while ((m = boundary.exec(text))) {
    if (m.index < index) start = m.index + 1;
    else {
      end = m.index;
      break;
    }
  }
  return text.slice(start, end + 1).trim();
}

function classifyReference(term, clause, cardName) {
  const lowerTerm = term.toLowerCase();
  const lowerClause = clause.toLowerCase();

  if (cardName && lowerTerm === cardName.toLowerCase()) {
    return { term, type: "self_reference", severity: 0 };
  }

  // Mandatory activation/summoning requirement - the card is
  // inert without this. Deliberately narrow patterns (real
  // oracle-text conventions) so we don't over-fire on incidental
  // quotes.
  if (
    /cannot be (?:normal |special )?summoned except/i.test(lowerClause) ||
    /cannot be special summoned[^.]*except by (?:using|banishing|tributing)/i.test(lowerClause) ||
    // "Must first be Special Summoned ... by banishing/tributing/
    // sending ..." is the other standard oracle-text convention for
    // a hard Special Summon requirement (used by e.g. many named
    // archetype bosses) - just as mandatory as "cannot be Special
    // Summoned except", just phrased affirmatively instead of as an
    // exclusion.
    /must first be (?:normal |special )?summoned[^.]{0,80}by (?:banishing|tributing|sending|shuffling)/i.test(lowerClause) ||
    /(?:this card )?cannot be activated unless you control/i.test(lowerClause) ||
    /you can only activate this card if you control/i.test(lowerClause) ||
    /this card cannot attack unless you control/i.test(lowerClause)
  ) {
    return { term, type: "mandatory_requirement", severity: 3 };
  }

  // Optional bonus - "if you control a 'X', you can also/
  // additionally..." - the base effect does not need it.
  if (
    /^(?:also,?\s*)?if you control (?:a|an|1) ["“]/i.test(lowerClause) &&
    /(?:you can (?:also|additionally)|additionally|also,)/i.test(lowerClause)
  ) {
    return { term, type: "optional_bonus", severity: 0.5 };
  }

  // Alternative effect - an "or" between two+ quoted options means
  // a real choice exists, softening what would otherwise be a hard
  // requirement (covers both "target X or Y" and "Special Summon
  // 'X' or 'Y' from your GY").
  const hasQuotedAlternative = /["“][^"”]+["”]\s*(?:,|or)\s*["“]/i.test(clause);
  if (hasQuotedAlternative) {
    return { term, type: "alternative_effect", severity: 1 };
  }

  // Search target - this card ADDS the reference to your hand, it
  // does not require you to already have it.
  if (/add[^.]{0,80}from your (?:deck|graveyard) to your hand/i.test(lowerClause)) {
    return { term, type: "search_target", severity: 0.25 };
  }

  // Mandatory target - the effect must target this specific named
  // card and no alternative was offered.
  if (/target[^.]{0,60}["“]/i.test(lowerClause) || new RegExp(`target[^.]{0,60}${escapeRegExp(lowerTerm)}`, "i").test(lowerClause)) {
    return { term, type: "mandatory_target", severity: 2 };
  }

  // Fallback: a quoted reference we can't confidently classify.
  // Treated as a moderate (not severe) signal, and flagged so the
  // audit report can surface it for human review instead of
  // silently guessing either extreme.
  return { term, type: "ambiguous_reference", severity: 1.5, ambiguous: true };
}

// Deduplicate references to the same term, keeping the single
// most-severe classification found for it, so a card that quotes
// the same name twice (e.g. once as a search target, once as a
// hard-OPT self-reference for a DIFFERENT card) isn't double
// counted.
function dedupeReferences(classified) {
  const byTerm = new Map();
  for (const ref of classified) {
    const key = ref.term.toLowerCase();
    const existing = byTerm.get(key);
    if (!existing || ref.severity > existing.severity) {
      byTerm.set(key, ref);
    }
  }
  return Array.from(byTerm.values());
}

// ---------------------------------------------------------
// Extra Deck material parsing.
//
// Oracle text convention: for Fusion/Synchro/Xyz/Link monsters,
// the summoning requirement is the FIRST line/sentence, before
// the rest of the effect. We inspect ONLY that segment - never
// the card's archetype tag, never its name - and bucket it:
//
//   generic     - any count-based condition with no name/
//                 Attribute/Type/Tuner lock ("2 monsters",
//                 "1 Fusion, Synchro, or Xyz Monster, plus 1
//                 non-Tuner monster", "2 Level 4 monsters").
//   constrained - locked to an Attribute, Type, or Tuner
//                 requirement, but still no specific named card
//                 ("2 DARK monsters", "1 Tuner + 1 or more
//                 non-Tuner Dragon-Type monsters").
//   named       - requires a specific named card as material.
// ---------------------------------------------------------

function parseExtraDeckMaterials(text, isExtraDeckCard) {
  if (!isExtraDeckCard) {
    return { specificity: "n/a", materialText: "", reason: "" };
  }

  const nlIdx = text.indexOf("\n");
  let materialText = nlIdx >= 0 ? text.slice(0, nlIdx) : (text.split(/\.\s/)[0] || text);
  materialText = materialText.trim();
  if (!materialText) {
    return { specificity: "generic", materialText: "", reason: "No material text found - treated as generic rather than assumed narrow." };
  }

  const hasQuotedName = /["“][A-Z]/.test(materialText);
  if (hasQuotedName) {
    return {
      specificity: "named",
      materialText,
      reason: `Materials require a specific named card: "${materialText}".`,
    };
  }

  // A bare "Tuner" requirement (e.g. "1 Tuner + 1 or more non-Tuner
  // monsters") is a real constraint; "non-Tuner" alone is not. Uses
  // a negative lookbehind rather than split-and-test, since
  // splitting ON "tuner" removes the very substring a naive
  // "does this contain non-tuner" check would need to see.
  const hasBareTunerRequirement = /(?<!non-)\btuner\b/i.test(materialText);
  const hasAttributeOrTypeLock =
    /\b(?:LIGHT|DARK|WATER|FIRE|EARTH|WIND|DIVINE)\b/.test(materialText) ||
    /-type\b/i.test(materialText) ||
    hasBareTunerRequirement;

  if (hasAttributeOrTypeLock) {
    return {
      specificity: "constrained",
      materialText,
      reason: `Materials are Attribute/Type/Tuner-constrained but not named: "${materialText}".`,
    };
  }

  return {
    specificity: "generic",
    materialText,
    reason: `Materials are generic (count/rank/level-based only, no name or Attribute/Type lock): "${materialText}".`,
  };
}

// ---------------------------------------------------------
// Signal extraction
// ---------------------------------------------------------

/**
 * Extracts structured, explainable signals from one card_catalog
 * row. Every field here is either a direct DB column or a plain
 * regex/clause match against `description` - nothing inferred
 * beyond what the text/fields literally say, and (as of v2)
 * card.archetype is NEVER used to directly penalize the card -
 * only to explain whether it is functionally load-bearing.
 *
 * @param {{
 *   name: string|null, card_type: string|null, frame_type: string|null,
 *   race: string|null, attribute: string|null,
 *   level: number|null, rank: number|null, link_rating: number|null,
 *   atk: number|null, def: number|null, archetype: string|null,
 *   description: string|null,
 * }} card
 */
export function extractValuationSignals(card) {
  const text = card.description || "";
  const t = text.toLowerCase();
  const name = card.name || "";
  const archetype = card.archetype || null;
  const extra = isExtraDeckType(card.card_type || card.frame_type);
  const monster = isMonster(card.card_type);
  const spell = isSpell(card.card_type);
  const trap = isTrap(card.card_type);
  const isExtraDeckCard = extra.fusion || extra.synchro || extra.xyz || extra.link;
  const isNormalMonster = monster && /normal monster/i.test(card.card_type || "");
  const isFlip = /\bflip:/i.test(text) || /flip summon/i.test(t);
  const isQuickPlay = /quick-play/i.test(card.card_type || "");
  const isQuickEffect = /\(quick effect\)/i.test(t);
  const isContinuous = /continuous/i.test(card.card_type || "");

  // --- Costs (things you must PAY to get the effect) ---
  const costTribute = /tribute (?:1|2|3|a|this card)/i.test(t) && !/synchro|xyz|fusion|link/i.test(t.slice(0, 40));
  const costDiscard = /discard (?:1|2|3|a|\d+ card)/i.test(t);
  const costBanishSelf = /banish this card (?:from your hand|from your (?:field|graveyard))?/i.test(t);
  const costBanishOther = /you can banish \d* ?(?:cards?)? from your/i.test(t) || /banish \d+ (?:cards?)? from your (?:hand|deck|graveyard)/i.test(t);
  const costLifePoints = /pay \d+ life ?points/i.test(t);
  const costHandCard = /(?:send|discard) \d+ cards? from your hand/i.test(t);
  const hasCost = costTribute || costDiscard || costBanishSelf || costBanishOther || costLifePoints || costHandCard;

  // --- Recoverable-from-Graveyard: a real accessibility/floor
  // upside missed entirely in v1 - e.g. Scrap-Iron Scarecrow
  // keeps working even after being milled/discarded, unlike a
  // plain Set-and-wait Trap. ---
  const usableFromGraveyard =
    /if this card is in (?:your |the )?graveyard/i.test(t) ||
    /banish this card from your graveyard/i.test(t) ||
    /you can banish this card from your gy/i.test(t);

  // --- Life Point swing direction matters for power, and was
  // conflated with costLifePoints in v1 (which only tracked
  // PAYING life points). This tracks GAINING them - a real,
  // distinct upside (e.g. Draining Shield vs. plain Negate
  // Attack). ---
  const gainsLifePoints = /gain(?:s)? life points? equal to/i.test(t) || /gain \d+ life points?/i.test(t);
  const endsBattlePhase = /end the battle phase/i.test(t);

  // --- Once-per-turn gating ---
  const hardOncePerTurn = /you can only use this effect of ["“][^"”]+["”]? once per turn/i.test(text) ||
    /you can only use \d+ of these effects? of ["“][^"”]+["”]? per turn/i.test(text) ||
    /once per turn[,:]/i.test(text);
  const softOncePerTurn = /once per turn/i.test(t) && !hardOncePerTurn;

  // --- Multi-Attribute board-state requirements (Fuh-Rin-Ka-Zan
  // style effects: "WIND, WATER, FIRE and EARTH monster(s) on the
  // field"). Unchanged from v1 - this part was never in dispute,
  // and re-validated by the regression suite. ---
  const attributeListMatch = text.match(
    /((?:LIGHT|DARK|WATER|FIRE|EARTH|WIND|DIVINE)(?:\s*,\s*(?:LIGHT|DARK|WATER|FIRE|EARTH|WIND|DIVINE)){1,5}\s*(?:,?\s*and\s*)?(?:LIGHT|DARK|WATER|FIRE|EARTH|WIND|DIVINE))/
  );
  const distinctAttributesRequired = attributeListMatch
    ? new Set(attributeListMatch[1].toUpperCase().match(/LIGHT|DARK|WATER|FIRE|EARTH|WIND|DIVINE/g) || []).size
    : 0;

  const boardStateRequirement =
    /if you control no other cards/i.test(t) ||
    /if you control \d+ or more/i.test(t) ||
    /with \d+ or more (?:different )?(?:types|attributes)/i.test(t) ||
    distinctAttributesRequired >= 2;

  const materials = parseExtraDeckMaterials(text, isExtraDeckCard);

  // --- Reference classification (see classifyReference above).
  // A reference inside the Extra Deck materials line is EXCLUDED
  // here - parseExtraDeckMaterials() already scores that line's
  // specificity distinctly (generic/constrained/named). Without
  // this exclusion, a named material like '1 "Red-Eyes" monster'
  // would ALSO get re-classified by the generic clause-based
  // classifier (which has no "this is a materials line" concept of
  // its own and would fall back to a weak "ambiguous_reference"),
  // double-counting or under-counting the same real requirement. ---
  const materialLineEnd = isExtraDeckCard
    ? (text.indexOf("\n") >= 0 ? text.indexOf("\n") : (text.indexOf(". ") >= 0 ? text.indexOf(". ") + 1 : 0))
    : -1;
  const quotedRefs = extractQuotedReferences(text).filter((r) => !(isExtraDeckCard && r.index < materialLineEnd));
  const classifiedRefsRaw = quotedRefs.map((r) =>
    classifyReference(r.term, clauseAround(text, r.index), name)
  );
  const classifiedRefs = dedupeReferences(classifiedRefsRaw);

  // Is this card's archetype tag actually load-bearing in its own
  // text, or purely a database grouping label? Only
  // mandatory_requirement / mandatory_target / named Extra Deck
  // materials count as "load-bearing" - search targets, optional
  // bonuses, and self-references never do.
  const archetypeFunctionalRefs = archetype
    ? classifiedRefs.filter(
        (r) =>
          r.term.toLowerCase().includes(archetype.toLowerCase()) &&
          (r.type === "mandatory_requirement" || r.type === "mandatory_target")
      )
    : [];
  const archetypeMaterialLock =
    !!archetype && materials.specificity === "named" && materials.materialText.toLowerCase().includes(archetype.toLowerCase());
  const archetypeIsThematicOnly = !!archetype && archetypeFunctionalRefs.length === 0 && !archetypeMaterialLock;

  // --- Removal / disruption. v2 fix: "negate the attack" is now
  // tracked SEPARATELY from "negate the activation/effect" -
  // conflating them in v1 was the direct, confirmed cause of the
  // Negate Attack / Draining Shield / Scrap-Iron Scarecrow
  // convergence complaint. Attack-only negation is real but far
  // more situational (defense-only, Battle Phase only) than a
  // universal activation/effect negate. ---
  const removalDestroy = /destroy (?:1|2|3|a|all|target)/i.test(t) || /destroy that (?:target|card)/i.test(t);
  const removalBounce = /(?:return|shuffle)[^.]{0,40}(?:to (?:the|your opponent's) (?:hand|deck))/i.test(t);
  const removalBanish = /banish (?:1|2|3|a|it|that|all)/i.test(t) && !costBanishSelf;
  const negatesActivationOrEffect =
    /negate the (?:activation|effect)/i.test(t) ||
    // Active-voice constructions: "negate their/its/that effect(s)"
    // (as opposed to "negate the effect", which the pattern above
    // already covers when phrased with "the").
    /negate[sd]? (?:their|its|that(?:'s| monster's)?) (?:activation|effects?)/i.test(t) ||
    /negate that/i.test(t) ||
    // Covers both "...effects are negated" (Skill Drain-style) AND
    // "have their effects negated" (Dark Ruler No More-style) - the
    // v1 regex required a literal "are"/"is" immediately before
    // "negated" and missed the second, very common construction.
    /(?:effects?|activations?)[^.]{0,40}negated/i.test(t);
  // Mass effects (destroy/banish/bounce/negate ALL, not just a
  // single target) are meaningfully stronger than their
  // single-target equivalents and get their own power bump below -
  // scans every clause containing "all" for a removal/negate verb,
  // rather than assuming any single fixed phrase.
  const massEffectClauses = text.match(/[^.]*\ball\b[^.]*/gi) || [];
  const isMassEffect = massEffectClauses.some((c) => /destroy|banish|return|negat/i.test(c));
  const negatesAttack = /negate the attack/i.test(t);
  const removalNegate = negatesActivationOrEffect || negatesAttack;
  const nonTargeting = /(?:destroy|banish|negate)[^.]{0,60}(?:without targeting|that does not target)/i.test(t);
  const providesRemoval = removalDestroy || removalBounce || removalBanish || removalNegate;

  // --- Protection ---
  const battleProtection = /cannot be destroyed by battle/i.test(t);
  const effectProtection = /cannot be destroyed by (?:card )?effects/i.test(t) || /cannot be (?:targeted|affected) by/i.test(t);
  const fullProtection = /cannot be destroyed(?: by battle)? or affected by/i.test(t) || (battleProtection && effectProtection);
  const conditionalProtection = (battleProtection || effectProtection) &&
    /(?:once per turn|if|while you control|as long as)/i.test(t);

  // --- Floodgate / lock patterns ---
  const floodgateOpponentCannotActivate =
    /your opponent cannot activate/i.test(t) ||
    /neither player can (?:activate|special summon)/i.test(t) ||
    /cards and effects (?:cannot|can)not be activated/i.test(t);
  // A "cannot be Special Summoned" phrase is a real opponent-facing
  // floodgate ONLY when the sentence containing it never mentions
  // "this card" - a monster restricting how IT ITSELF can be
  // Special Summoned ("This card can only be Special Summoned by
  // Fusion Summon, and cannot be Special Summoned by other ways" -
  // extremely common on Extra Deck monsters) is a self-restriction,
  // not a floodgate against the opponent. v1's exclusion check only
  // scanned the ~40 characters AFTER the trigger phrase, which
  // missed "This card" when it appeared earlier in the SAME
  // sentence (as it almost always does) - this checks the whole
  // sentence instead.
  const floodgateCannotSummon = text
    .split(/\.\s*/)
    .some((sentence) => {
      const lower = sentence.toLowerCase();
      const hasRestriction = /special summons? are negated/.test(lower) || /cannot be special summoned/.test(lower);
      return hasRestriction && !/this card/.test(lower);
    });
  const floodgateBlanketNegation =
    /all face-up[^.]{0,30}effects[^.]{0,20}(?:are|on the field are) negated/i.test(t) ||
    /(?:all|every)[^.]{0,20}(?:monster|card) effects[^.]{0,30}negated/i.test(t);
  const floodgatePersistent =
    (floodgateOpponentCannotActivate || floodgateCannotSummon || floodgateBlanketNegation) &&
    (/as long as this card (?:remains|is) (?:face-up )?on the field/i.test(t) || isContinuous);
  const isFloodgateOrLock = floodgateOpponentCannotActivate || floodgateCannotSummon || floodgateBlanketNegation;

  // --- Searching. searchNarrow now derives from the reference
  // classifier's search_target entries (was: raw quote-in-text
  // check), so a search is only "narrow" when the fetched card is
  // an actual classified search_target reference. ---
  // Covers three real oracle-text shapes: (1) "add ... from your
  // Deck to your hand" (a direct search), (2) "add ... from your
  // Graveyard to your hand" (Graveyard recursion), and (3) "target
  // 1 [card] in your Graveyard; add that target to your hand"
  // (Magician of Faith's actual phrasing, where "from your
  // Graveyard" isn't repeated next to "to your hand" at all - v1
  // only recognized shape (1), so shapes (2) and (3) - a whole
  // class of GY-recovery cards - registered zero card advantage.
  const searches =
    /add[^.]{0,60}from your (?:deck|graveyard) to your hand/i.test(t) ||
    /add (?:that target|it|them|those cards?)[^.]{0,20}to your hand/i.test(t);
  const searchTargetRefs = classifiedRefs.filter((r) => r.type === "search_target");
  const searchNarrow = searches && searchTargetRefs.length > 0;
  const searchGeneric = searches && !searchNarrow;

  // --- Draw / advantage ---
  const drawsCards = /draw (?:1|2|3|a|\d+) cards?/i.test(t);
  const generatesAdvantage = drawsCards || searches || /special summon (?:1|a|this card) from your (?:hand|graveyard|deck)/i.test(t);

  return {
    isMonster: monster,
    isSpell: spell,
    isTrap: trap,
    isExtraDeckCard,
    extraDeckKind: extra,
    isNormalMonster,
    isFlip,
    isQuickPlay,
    isQuickEffect,
    isContinuous,
    atk: card.atk,
    def: card.def,
    hasCost,
    costTribute,
    costDiscard,
    costBanishSelf,
    costLifePoints,
    usableFromGraveyard,
    gainsLifePoints,
    endsBattlePhase,
    hardOncePerTurn,
    softOncePerTurn,
    distinctAttributesRequired,
    boardStateRequirement,
    classifiedRefs,
    materials,
    archetypeFunctionalRefs,
    archetypeIsThematicOnly,
    removalDestroy,
    removalBounce,
    removalBanish,
    removalNegate,
    negatesActivationOrEffect,
    negatesAttack,
    isMassEffect,
    nonTargeting,
    providesRemoval,
    battleProtection,
    effectProtection,
    fullProtection,
    conditionalProtection,
    isFloodgateOrLock,
    floodgatePersistent,
    searches,
    searchGeneric,
    searchNarrow,
    drawsCards,
    generatesAdvantage,
    textLength: text.length,
  };
}

// ---------------------------------------------------------
// Scoring
// ---------------------------------------------------------

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Scores one card across all eight axes and returns an
 * explanation. `answerDensity` (0-1, optional) is how well the
 * candidate pool already answers this card's protection/lock, per
 * the "format answer density" concept - pass null/undefined to
 * skip that adjustment (used for single-card ad-hoc scoring).
 * NOTE: answerDensity only ever affects oppressiveness, which is
 * NEVER folded into draftValue (see below) - it exists purely to
 * inform release_stage recommendations.
 *
 * @param {ReturnType<typeof extractValuationSignals>} s
 * @param {{ atk: number|null, def: number|null, level: number|null, rank: number|null, link_rating: number|null, archetype: string|null, name: string|null }} card
 * @param {{ answerDensity?: number|null }} [context]
 */
export function scoreCard(s, card, context = {}) {
  const reasons = [];
  const atk = Number(card.atk) || 0;

  // ---- (A) POWER: raw ceiling of the resolved effect, independent
  //      of how hard it is to enable. ----
  let power = 3.0;
  if (s.negatesActivationOrEffect) { power += 2.5; reasons.push("negates activations/effects (broadly relevant)"); }
  else if (s.negatesAttack) { power += 0.8; reasons.push("negates an attack only (situational, Battle Phase-only)"); }
  if (s.removalDestroy) power += 1.2;
  if (s.removalBounce) power += 0.8;
  if (s.removalBanish) power += 1.5;
  if (s.nonTargeting) { power += 0.8; reasons.push("non-targeting removal is hard to play around"); }
  if (s.isMassEffect) { power += 1.3; reasons.push("mass effect (hits multiple/all cards, not just one target)"); }
  if (s.isFloodgateOrLock) { power += 2.0; reasons.push("restricts what the opponent can do"); }
  if (s.drawsCards) power += 1.0;
  if (s.generatesAdvantage) power += 0.5;
  if (s.gainsLifePoints) { power += 0.4; reasons.push("also gains Life Points"); }
  if (s.fullProtection) { power += 1.5; reasons.push("hard to remove"); }
  else if (s.battleProtection || s.effectProtection) power += 0.6;
  // NOTE (2026-08-25 recalibration): a flat "+0.8 for being an Extra
  // Deck card" bonus used to live here. It rewarded Fusion/Synchro/
  // Xyz/Link purely for their frame_type, with zero functional
  // justification, and double-dipped against the separate Extra Deck
  // accessibility penalty below (-1.5) - i.e. the same trait was
  // punished in accessibility and rewarded in power. This was the
  // primary root cause of Legendary rarity being ~92% Fusion Monsters:
  // Extra Deck cards got a head start on power (and therefore ceiling,
  // which is built from power) that had nothing to do with how
  // exceptional the specific card actually was. Removed - Extra Deck
  // status now confers no power/ceiling advantage; see the new
  // generic-power ceiling bonus below, which any card (including
  // Extra Deck ones) can qualify for on the merits of its own power
  // and dependency, not its frame_type.
  if (s.isMonster && atk >= 2500) power += 0.8;
  if (s.isMonster && atk >= 3000) power += 0.5;
  if (s.textLength > 260) power += 0.4;
  power = clamp(power, 0, 10);

  // ---- (C) DEPENDENCY: what this card ACTUALLY, functionally
  //      requires - built entirely from classified references and
  //      parsed materials, never from a bare archetype-tag match.
  //      HIGHER = worse for random draft value. ----
  let dependency = 1.0;
  if (s.distinctAttributesRequired >= 3) { dependency += 4.0; reasons.push(`requires ${s.distinctAttributesRequired} different Attributes on field at once`); }
  else if (s.distinctAttributesRequired === 2) { dependency += 1.8; reasons.push("requires two specific Attributes at once"); }
  else if (s.boardStateRequirement) { dependency += 1.0; reasons.push("requires a specific board state"); }

  if (s.materials.specificity === "named") { dependency += 3.5; reasons.push(s.materials.reason); }
  else if (s.materials.specificity === "constrained") { dependency += 1.2; reasons.push(s.materials.reason); }
  // "generic" Extra Deck materials: no dependency penalty at all -
  // this is the direct fix for the Baronne de Fleur miscalibration.

  for (const ref of s.classifiedRefs) {
    if (ref.type === "mandatory_requirement") { dependency += 2.5; reasons.push(`cannot function without "${ref.term}"`); }
    else if (ref.type === "mandatory_target") { dependency += 1.5; reasons.push(`must target "${ref.term}" to do anything`); }
    else if (ref.type === "alternative_effect") { dependency += 0.4; }
    else if (ref.type === "ambiguous_reference") { dependency += 0.6; reasons.push(`references "${ref.term}" in a way the engine could not confidently classify (flagged for review)`); }
    // optional_bonus, search_target, self_reference: 0 penalty.
  }
  if (s.hasCost) dependency += 0.4;
  dependency = clamp(dependency, 0, 10);

  // ---- (B) ACCESSIBILITY: how easily this can be deployed on its
  //      OWN terms - cost, timing, Set-first delay, Extra Deck
  //      board-presence tax - independent of whether the deck has
  //      the right support cards (that's dependency's job). ----
  let accessibility = 6.5;
  if (s.isNormalMonster) accessibility = 5.0 + Math.min(2.0, atk / 2000);
  if (s.isTrap && !s.isQuickEffect) { accessibility -= 1.5; reasons.push("must be Set a turn before it can be activated"); }
  if (s.isSpell && !s.isQuickPlay) accessibility -= 0.3;
  if (s.isQuickPlay || s.isQuickEffect) { accessibility += 1.0; reasons.push("usable at instant speed"); }
  if (s.usableFromGraveyard) { accessibility += 1.2; reasons.push("still usable from the Graveyard even after being discarded/milled"); }
  if (s.hasCost) accessibility -= 0.8;
  if (s.costTribute) accessibility -= 1.2;
  if (s.costLifePoints) accessibility -= 0.3;
  if (s.isFlip) { accessibility -= 1.2; reasons.push("Flip Summon timing is fragile (vulnerable before flipping)"); }
  if (s.isExtraDeckCard) accessibility -= 1.5;
  if (s.isMonster && !s.isNormalMonster && !s.isExtraDeckCard) {
    if (atk === 0) { accessibility -= 1.0; reasons.push("0 ATK makes it a liability on offense"); }
    else if (atk > 0 && atk < 1200) accessibility -= 0.5;
  }
  if (s.hardOncePerTurn) accessibility -= 0.2;
  accessibility = clamp(accessibility, 0, 10);

  // ---- (E) CONSISTENCY: how reliably the useful effect is LIVE
  //      once you have the card. ----
  let consistency = 6.0;
  if (s.isFlip) consistency -= 1.5;
  if (s.hasCost) consistency -= 0.4;
  if (s.isTrap && !s.isQuickEffect) consistency -= 0.3;
  if (dependency >= 6) consistency -= 2.2;
  else if (dependency >= 3) consistency -= 0.9;
  if (s.classifiedRefs.some((r) => r.type === "mandatory_target")) { consistency -= 1.0; reasons.push("depends on the right target actually being on the field"); }
  if (s.conditionalProtection) consistency -= 0.5;
  if (s.usableFromGraveyard) consistency += 0.5;
  consistency = clamp(consistency, 0, 10);

  // ---- (D) GENERIC UTILITY: can nearly any random deck use this? ----
  let genericUtility = 5.0;
  if (s.providesRemoval && dependency < 3) genericUtility += 1.5;
  if (s.fullProtection || s.battleProtection || s.effectProtection) genericUtility += 0.5;
  if (s.drawsCards) genericUtility += 1.0;
  if (s.searchNarrow) { genericUtility -= 1.0; reasons.push("searches a narrow/named target, not broadly useful outside that plan"); }
  if (s.searchGeneric) genericUtility += 1.0;
  if (dependency >= 6) genericUtility -= 2.5;
  else if (dependency >= 3) genericUtility -= 1.0;
  if (s.isExtraDeckCard && s.materials.specificity === "generic") { genericUtility += 1.0; reasons.push("Extra Deck materials are generic - broadly splashable"); }
  if (s.isFloodgateOrLock) genericUtility -= 0.5;
  genericUtility = clamp(genericUtility, 0, 10);

  // ---- (F) FLOOR: guaranteed value with ZERO synergy/setup. ----
  let floor = power;
  const hasMandatoryReq = s.classifiedRefs.some((r) => r.type === "mandatory_requirement");
  if (hasMandatoryReq) { floor -= 4.5; reasons.push("effectively unusable without its required support"); }
  if (s.distinctAttributesRequired >= 3) floor -= 3.5;
  else if (s.distinctAttributesRequired === 2) floor -= 1.5;
  // A named-material Extra Deck monster is, from a floor
  // perspective, in the same category as a hard mandatory
  // requirement: without owning the specific named card, it is a
  // brick in the deck. Weighted the same as hasMandatoryReq above.
  if (s.materials.specificity === "named") floor -= 4.5;
  else if (s.materials.specificity === "constrained") floor -= 1.0;
  if (s.classifiedRefs.some((r) => r.type === "mandatory_target")) floor -= 1.0;
  floor = clamp(floor, 0, 10);

  // ---- (G) CEILING: best-case value when fully enabled/
  //      supported. Archetype/build-around cards are explicitly
  //      allowed a high ceiling here - dependency penalizes
  //      draftValue, not ceiling. ----
  let ceiling = power;
  if (s.classifiedRefs.some((r) => r.type === "optional_bonus")) ceiling += 1.0;
  if (card.archetype && !s.archetypeIsThematicOnly) { ceiling += 1.0; reasons.push(`genuine payoff for a "${card.archetype}" build`); }
  if (s.materials.specificity === "named" || hasMandatoryReq) ceiling += 0.5;
  // NOTE (2026-08-25 recalibration): before this, EVERY ceiling bonus
  // above required an archetype-lock/build-around/dependency signal
  // (an optional-bonus reference, an archetype payoff, or named/
  // mandatory materials). A genuinely generic, non-archetype-locked
  // card - exactly the "game-defining Spell/Trap utility" or
  // "generic/high-floor power" profile Legendary is supposed to be
  // reachable through - had NO comparable path to a high ceiling, no
  // matter how strong its raw power. Spell/Trap cards in particular
  // have no ATK stat and can never trigger the ATK-based power bonuses
  // above, so their power (and therefore ceiling) structurally capped
  // low. This closes that gap: a card that is simply exceptional on
  // its own terms (high power) AND not meaningfully archetype-locked
  // (low dependency) earns a ceiling bonus of its own, independent of
  // card_type or Extra Deck status. The thresholds (power >= 7.2,
  // dependency <= 4.0) were chosen empirically against the real
  // 8,954-card Season-1-eligible pool (2026-08-23T16:39:22Z export)
  // to open a genuine Path A/C route to Legendary without blowing the
  // Legendary count past the 20-30 target band - see
  // docs/legendary-rarity-calibration-2026-08-25.md for the full
  // grid-search methodology and results.
  if (power >= 7.2 && dependency <= 4.0) { ceiling += 2.0; reasons.push("exceptionally strong on its own terms, not just as an archetype payoff"); }
  ceiling = clamp(ceiling, 0, 10);

  // ---- (H) OPPRESSIVENESS: how problematic in a small starting
  //      pool - kept ENTIRELY separate from draftValue below. A
  //      card can be extremely desirable (high draftValue) and
  //      still unsuitable for Season 1 (high oppressiveness) - see
  //      recommendOppressiveness(), which drives release_stage,
  //      never rarity. ----
  let oppressiveness = 0.5;
  if (s.isFloodgateOrLock) { oppressiveness += 4.0; reasons.push("floodgate/lock effect"); }
  if (s.floodgatePersistent) oppressiveness += 1.5;
  if (s.negatesActivationOrEffect && !s.hardOncePerTurn && !s.softOncePerTurn) { oppressiveness += 1.5; reasons.push("repeatable activation/effect negation with no once-per-turn limit found in text"); }
  if (s.fullProtection && !s.conditionalProtection) oppressiveness += 1.0;
  if (s.generatesAdvantage && !s.hardOncePerTurn && !s.softOncePerTurn && power >= 6) oppressiveness += 1.0;
  if (context.answerDensity != null && (s.isFloodgateOrLock || s.fullProtection)) {
    oppressiveness -= context.answerDensity * 2.0;
  }
  oppressiveness = clamp(oppressiveness, 0, 10);

  // ---- DRAFT VALUE: how valuable it is to be RANDOMLY offered
  //      this card. Weighted mostly by floor (what you actually
  //      get without a build-around), a real but smaller ceiling
  //      weight (payoff upside is allowed to matter), accessibility,
  //      genericUtility and consistency, minus a dependency
  //      penalty. Deliberately excludes oppressiveness entirely -
  //      that axis governs release_stage, not rarity/draft value. ----
  let draftValue =
    floor * 0.28 +
    ceiling * 0.14 +
    accessibility * 0.20 +
    genericUtility * 0.16 +
    consistency * 0.14 -
    dependency * 0.22;
  draftValue = clamp(draftValue, 0, 10);

  if (reasons.length === 0) {
    reasons.push("straightforward, unconditional effect");
  }

  return {
    power: round2(power),
    accessibility: round2(accessibility),
    dependency: round2(dependency),
    genericUtility: round2(genericUtility),
    consistency: round2(consistency),
    floor: round2(floor),
    ceiling: round2(ceiling),
    oppressiveness: round2(oppressiveness),
    draftValue: round2(draftValue),
    reason: buildReasonSentence(reasons, { power, dependency, draftValue, floor, ceiling }),
  };
}

function buildReasonSentence(reasons, scores) {
  const unique = Array.from(new Set(reasons));
  const clause = unique.slice(0, 3).join("; ");
  if (scores.dependency >= 6 && scores.ceiling >= 6 && scores.floor <= 3) {
    return `High-ceiling build-around card, but ${clause} - low floor without the right support, so treat this as an exciting payoff for the right deck rather than a generically strong card.`;
  }
  if (scores.dependency >= 6 && scores.power >= 6) {
    return `Powerful but ${clause}, so real-world draft value is much lower than raw power alone would suggest.`;
  }
  if (scores.draftValue >= 7) {
    return `Strong, broadly usable card: ${clause}.`;
  }
  if (scores.draftValue <= 3) {
    return `Low practical draft value: ${clause}.`;
  }
  return `${clause[0].toUpperCase()}${clause.slice(1)}.`;
}

/**
 * Maps a full 8-axis score object to a proposed rarity band.
 * Rarity means "how desirable is this to be randomly offered",
 * NOT raw theoretical power, and NOT the same axis as release
 * stage (oppressiveness/suggestedStage) - see recommendOppressiveness
 * below, which is deliberately a separate function fed by a
 * separate axis. A card CAN be Legendary and release_stage 2/3 at
 * the same time; this function never looks at oppressiveness.
 *
 * CALIBRATION HISTORY (2026-08-23 rarity calibration pass):
 * The first cut of this mapping (thresholds >=8.6/7.6/6.4/5.0/3.2
 * on draftValue alone) produced 0 Secret Rare and 0 Legendary
 * across the real 13,931-card catalog - draftValue's real
 * achievable max is only ~7.27, so those top two thresholds were
 * simply unreachable (a calibration bug, not a semantic one -
 * confirmed by percentile analysis of the real v2-scored export,
 * see reports/card-valuation/2026-08-23T15-57-16-226Z/).
 *
 * The second cut (draftValue-only bottom tiers with quality gates
 * only for the top two) fixed that but then over-concentrated the
 * catalog into Rare (78%) - the real draftValue distribution is a
 * tight, unimodal hump (most cards cluster in a narrow ~3.6-4.3
 * band; see the fine-percentile dump in the same calibration
 * session), so fixed cut points chosen without checking the
 * cumulative-percentage shape put the vast majority of that hump
 * into one bucket.
 *
 * This (third, current) cut re-grounds ALL SIX bands in the real
 * fine-grained percentile structure of that same 13,931-card
 * export (not just the top two), producing on that real data:
 *   Normal 37.9%, Rare 31.6%, Super Rare 17.8%, Ultra Rare 8.8%,
 *   Secret Rare 2.9%, Legendary 0.9%
 * - within the requested sanity ranges (Normal ~35-45%, Rare
 * ~25-35%, Super ~15-22%, Ultra ~7-12%, Secret ~2-5%, Legendary
 * ~0.5-1.5%) without hardcoding any specific card or forcing a
 * quota - the cut points are real percentile natural breaks, and
 * the top two tiers still require an explicit multi-axis quality
 * gate (never draftValue alone), preserving a build-around path
 * (high ceiling + acceptable floor/utility/accessibility) so a
 * high-dependency payoff card can still reach Ultra/Secret/
 * Legendary on the strength of its ceiling, per the explicit
 * build-around-handling requirement.
 *
 * FORMAT-AWARE RECALIBRATION (2026-08-25, engine 2026-08-25.1):
 * The third cut above was calibrated against the FULL 13,931-card
 * catalog, not the actual Season-1 playable pool. Against the true
 * live format_eligible pool (season1_provisional_eligible &&
 * suggested_release_stage === 1, ~8,954 cards - see
 * is_duelist_circle_format_eligible() in
 * supabase/migrations/202608231500_duelist_circle_format_engine.sql),
 * this produced only 13 Legendary cards: 12 Fusion Monsters and 1
 * Effect Monster. Root-caused to two upstream scoring bugs, both
 * fixed in scoreCard() above (see the two 2026-08-25 NOTEs there): a
 * flat, functionally-unjustified Extra Deck power bonus, and a
 * ceiling formula whose every bonus term required an archetype-lock/
 * build-around signal, leaving generic high-power cards (especially
 * Spell/Trap, which have no ATK stat to draw a power bonus from at
 * all) with no path to a high ceiling. With the upstream fix alone,
 * empirical grid search against the real eligible pool (see
 * docs/legendary-rarity-calibration-2026-08-25.md) found Path B's old
 * ceiling >= 9.6 threshold now excluded several genuinely exceptional
 * generic cards that the new, more honest ceiling scale puts at 9.3-
 * 9.4; lowering the threshold to 9.4 restores them without materially
 * loosening the gate (the multi-axis gu/accessibility/floor
 * requirements are unchanged). Net result on the true eligible pool:
 * 25 Legendary (Xyz 1, Main Deck Monster 12, Trap 7, Spell 3, Fusion
 * 2), no card_type over 50%, Fusion down from 92% to 8% of Legendary,
 * and Path A (draftValue >= 6.3 && floor >= 4.5) - previously
 * completely unreachable by any card in the pool - now has 9 genuine
 * passers, restoring it as a real second route to Legendary rather
 * than dead code.
 */
export function proposeRarity(scores) {
  const { accessibility, dependency, genericUtility, floor, ceiling, draftValue } = scores;

  const legendaryGate =
    ceiling >= 9.0 &&
    genericUtility >= 4.0 &&
    accessibility >= 4.3 &&
    (
      // Path A: a true powerhouse - strong draft value AND a real floor.
      (draftValue >= 6.3 && floor >= 4.5) ||
      // Path B: exceptional build-around payoff - very high ceiling,
      // not a total brick, unless the payoff is truly maximal
      // (ceiling >= 9.9) where a low floor alone shouldn't disqualify
      // a genuinely elite reward. Threshold lowered from 9.6 to 9.4 in
      // the 2026-08-25 format-aware recalibration (see above) to match
      // the new, more honestly-earned ceiling scale.
      (ceiling >= 9.4 && (floor >= 3.0 || ceiling >= 9.9))
    );
  if (legendaryGate) return "Legendary";

  const secretGate =
    (
      // Path A: strong generic power AND meaningfully high ceiling.
      (draftValue >= 5.75 && ceiling >= 7.0) ||
      // Path B: a real build-around payoff that's also reasonably
      // castable and not a floor disaster.
      (ceiling >= 8.6 && floor >= 3.5 && genericUtility >= 3.5 && accessibility >= 4.0 && dependency <= 6.5)
    ) &&
    genericUtility >= 3.0;
  if (secretGate) return "Secret Rare";

  const ultraGate =
    draftValue >= 5.15 ||
    // Build-around path: exciting payoff, some floor/consistency,
    // reasonably accessible for what it is.
    (ceiling >= 7.7 && floor >= 2.5 && accessibility >= 4.0 && genericUtility >= 2.5);
  if (ultraGate) return "Ultra Rare";

  if (draftValue >= 4.45) return "Super Rare";
  if (draftValue >= 3.90) return "Rare";
  return "Normal";
}

// Pure, unit-testable form of the "never overwrite a manually
// reviewed card" rule scripts/audit-card-valuation.mjs applies before
// any --write-scores upsert. Extracted (2026-08-25) so this exact
// predicate can be covered by lib/valuation-engine.regression.test.mjs
// without needing to import the audit script itself (which builds a
// live Supabase client at module load time and is not safe to import
// from a test process). MANUAL REVIEW PHILOSOPHY: the engine
// proposes, it never silently overwrites a card a human has already
// reviewed - valuation_manually_overridden is that flag for the
// valuation/rarity pipeline specifically (rarity_manually_overridden
// is the analogous, older flag the now-deprecated
// scripts/classify-rarities.mjs checked).
export function isWritableForValuation(card) {
  return card?.valuation_manually_overridden !== true;
}

// Deprecated alias kept ONLY so nothing that still imports the old
// name hard-crashes; every real call site in this repo has been
// migrated to proposeRarity(scores). Do not add new callers of this.
export function draftValueToRarity(draftValue) {
  return proposeRarity({
    accessibility: 10,
    dependency: 0,
    genericUtility: 10,
    floor: draftValue,
    ceiling: draftValue,
    draftValue,
  });
}

/**
 * Recommends an oppressiveness tier + release stage suggestion.
 * Never recommends deletion, and never affects rarity - only
 * release_stage. This is the ONLY consumer of the oppressiveness
 * axis; draftValue/rarity never see it.
 */
export function recommendOppressiveness(oppressiveness, power, dependency) {
  if (oppressiveness >= 6.5) {
    return {
      tier: "red",
      reason: "High oppressiveness in a small pool - recommend a later release stage rather than starting-pool inclusion.",
      suggestedStage: 3,
    };
  }
  if (oppressiveness >= 3.5 || (power >= 7.5 && dependency <= 3)) {
    return {
      tier: "orange",
      reason: oppressiveness >= 3.5
        ? "Moderate oppressiveness risk - manual review recommended before starting-pool inclusion."
        : "High power with low dependency (easy to use) - manual review recommended for an early-power-spike risk.",
      suggestedStage: 2,
    };
  }
  return {
    tier: "green",
    reason: "No significant early-pool risk signals detected.",
    suggestedStage: 1,
  };
}

export const VALUATION_ENGINE_VERSION = "2026-08-25.1";

export { RARITY_ORDER, extractQuotedReferences, clauseAround, classifyReference, parseExtraDeckMaterials };
