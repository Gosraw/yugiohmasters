// data/archetype-registry.mjs
//
// ARCHETYPE REGISTRY - HUMAN/DOMAIN-KNOWLEDGE SOURCE OF TRUTH
//
// This is the hand-maintained JS data behind the archetype_registry /
// archetype_cards tables (see
// supabase/migrations/202608301300_archetype_registry_schema.sql for the
// storage schema and supabase/migrations/202608301400_seed_archetype_registry.sql,
// generated from this file by scripts/generate-archetype-registry-migration.mjs,
// for the actual seed data). lib/archetype-registry.mjs reads the same shape
// (validated against a live snapshot at query time in production; against the
// real per-card.json report offline) to serve getArchetype().
//
// SOURCE OF TRUTH FOR ROSTERS
// Every `cards[].name` below was confirmed to be a REAL card that exists in
// this project's own catalog and is either eligible_core (<=2014, unconditionally
// legal in Duelist Circle Classic) or override_included (a card explicitly
// whitelisted by an earlier migration - see the `notes` field on those entries
// for which whitelist). This was checked against the real audit artifact
// reports/duelist-circle-classic/2026-08-30T18-12-01-890Z/per-card.json (13,931
// real cards, gitignored, generated locally) via jq, not invented from memory.
// scripts/generate-archetype-registry-migration.mjs re-checks every name against
// a fresh snapshot before emitting SQL and refuses to emit a row for a name it
// can't find.
//
// CONFIDENCE DISCIPLINE
// `needsReview: true` marks a card whose role/tier/difficulty this pass was
// NOT fully confident in - usually because the exact oracle text or Fusion
// material line for an obscure 2010-2012 print could not be verified with
// certainty from training knowledge alone. These cards are still included
// (not silently dropped) but are held at a conservative tier (EXPANSION at
// most, never ESSENTIAL) and should be double-checked by a human against the
// real card text before being trusted. This mirrors the same discipline used
// throughout the human calibration and 2015-2018 whitelist passes: "if a card
// cannot be verified, place it in REVIEW rather than pretending certainty."
//
// ROLE DEFINITIONS
//   CORE    - a card the archetype's whole plan revolves around; the deck is
//             meaningfully worse without it.
//   SUPPORT - reinforces the plan (consistency, recovery, secondary value)
//             without being load-bearing.
//   BOSS    - an Extra Deck (or, where the real card_type is Main Deck, a
//             stand-out finisher-tier) payoff card.
//   UTILITY - a generic/flexible piece that happens to fit; useful without
//             being archetype-defining.
//   NICHE   - situational, narrow, or matchup-dependent; playable but not a
//             default include.
//   AVOID   - real, eligible, and tagged to this archetype in the catalog,
//             but this pass found no real functional reason to play it (or,
//             for Phantom Magician below, suspects the archetype tag itself
//             is a data artifact) - kept out of every package tier.
//
// EXTRA DECK / BOSS FIELDS
//   extraDeckKind    - "FUSION" | "XYZ" | null (null for Main Deck cards -
//                      Synchro/Link/Pendulum are never valid here; the DB
//                      trigger on archetype_cards independently re-verifies
//                      this against the card's real card_type/frame_type).
//   summonDifficulty - EASY/MODERATE/HARD/VERY_HARD, based on how hard the
//                      real required materials/setup are to assemble in this
//                      format, not the monster's stats. Set for BOSS-role
//                      Extra Deck cards; null otherwise.
//
// PACKAGE TIERS (per brief section 5 - "do NOT simply list every card")
//   ESSENTIAL   - what you hand a player who picks this archetype on day one.
//   RECOMMENDED - the deck once it has room to grow past the essentials.
//   EXPANSION   - real, legal, on-theme, but a later/optional pickup.
//   null        - not part of any curated package (normal for most
//                 SUPPORT/UTILITY/NICHE/AVOID cards).
//
// BOSS PROGRESSION (brief section 10)
// Each archetype's `bossProgression` names, at most, one real card per stage
// (EARLY/MID/LATE/SIGNATURE). A stage is left null - with a `note` explaining
// why - rather than forcing a bad pick to fill an empty slot, exactly as the
// brief instructs.
//
// GAPS (brief section 8 - specific, never a bare "could use more support")
// Each archetype's `gaps` array is a list of {category, description} objects
// naming exactly what real category is missing and why it matters for this
// format specifically.

export const ROLES = ["CORE", "SUPPORT", "BOSS", "UTILITY", "NICHE", "AVOID"];
export const EXTRA_DECK_KINDS = ["FUSION", "XYZ"];
export const SUMMON_DIFFICULTIES = ["EASY", "MODERATE", "HARD", "VERY_HARD"];
export const PACKAGE_TIERS = ["ESSENTIAL", "RECOMMENDED", "EXPANSION"];
export const BOSS_STAGES = ["EARLY", "MID", "LATE", "SIGNATURE"];
export const LEVELS_LMH = ["LOW", "MEDIUM", "HIGH"];
export const SPEEDS = ["SLOW", "MEDIUM", "FAST"];
export const HEALTH_LEVELS = ["TOO_WEAK", "WEAK", "HEALTHY", "STRONG", "TOO_STRONG"];
export const DECK_REALITIES = ["FULL_DECK", "ENGINE_PLUS_GENERIC", "THIN_THEME"];

export const ARCHETYPE_REGISTRY = [
  {
    code: "dark_magician",
    name: "Dark Magician",
    archetypeTags: ["Dark Magician", "Magician Girl"],
    priorityRank: 1,
    description:
      "Duel Monsters' most recognizable Spellcaster lineup: Yugi's own Dark Magician and Dark Magician Girl, their Ritual/Fusion upgrades, and the Spell/Trap support that lets the deck find, protect, and rebuild around them.",
    profile: {
      nostalgiaRelevance: "HIGH",
      consistency: "MEDIUM",
      removal: "MEDIUM",
      defense: "LOW",
      recovery: "HIGH",
      bossPower: "HIGH",
      summoningSpeed: "MEDIUM",
      overallHealth: "HEALTHY",
      deckReality: "FULL_DECK",
    },
    gaps: [
      {
        category: "searcher",
        description:
          "No generic card adds 'Dark Magician' by name to hand outside Sage's Stone's Level-2-Spellcaster condition (which itself needs a specific small monster on board) - a bad opening hand has no reliable way to find the deck's own namesake.",
      },
      {
        category: "defensive_card",
        description:
          "No wall or protection Spell/Trap exists in the eligible pool; the deck has no answer to being out-tempo'd before its Fusion bosses come online.",
      },
    ],
    bossProgression: {
      early: "Dark Magician of Chaos",
      mid: "Dark Magician Girl the Dragon Knight",
      late: "Amulet Dragon",
      signature: "Dark Paladin",
      note: null,
    },
    notes:
      "Eternal Soul (2015-2018 whitelist, migration 202608301200) directly fixes part of the recovery/protection gap by reviving a destroyed Dark Magician - already reflected in the recovery=HIGH rating above.",
    cards: [
      { name: "Dark Magician", role: "CORE", packageTier: "ESSENTIAL", notes: "Namesake Normal Monster; every build needs it." },
      { name: "Dark Magician Girl", role: "CORE", packageTier: "ESSENTIAL", notes: "Iconic co-lead; gains ATK per Dark Magician/Magician-named card in GY." },
      { name: "Dark Magician of Chaos", role: "CORE", packageTier: "RECOMMENDED", notes: "Banishes itself from GY to return a Spell to hand; strong recursion engine, real downside cost." },
      { name: "Skilled Dark Magician", role: "CORE", packageTier: "RECOMMENDED", notes: "Accumulates Spell Counters toward Special Summoning a follow-up threat; a real Level-4 consistency body." },
      { name: "Sage's Stone", role: "CORE", packageTier: "ESSENTIAL", notes: "Special Summons Dark Magician from hand when you control a Level 2 or lower Spellcaster - the deck's best consistency piece." },
      { name: "Thousand Knives", role: "CORE", packageTier: "ESSENTIAL", notes: "Destroys an opponent's monster while you control Dark Magician - the archetype's real removal answer." },
      { name: "Dark Magic Curtain", role: "CORE", packageTier: "RECOMMENDED", notes: "Pays 1000 LP to Special Summon Dark Magician from Deck, then can Special Summon a listed Fusion Monster without the Fusion procedure - directly enables the Fusion bosses below." },
      { name: "Dedication through Light and Darkness", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Tributes a Dark Magician/Magician of Black Chaos to summon Dark Magician of Chaos banished-until-return; costly but real value." },
      { name: "Miracle Restoring", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Special Summons a Spellcaster from GY at the cost of banishing a card from GY - real recovery piece." },
      { name: "Dark Magician Knight", role: "SUPPORT", packageTier: "EXPANSION", notes: "Gains 300 ATK per Dark Magician-named card in GY; a scaling beater." },
      { name: "Black Magic Ritual", role: "SUPPORT", packageTier: "EXPANSION", notes: "Ritual Summons Magician of Black Chaos, the deck's Ritual Monster." },
      { name: "Magician of Black Chaos", role: "SUPPORT", extraDeckKind: null, packageTier: "EXPANSION", notes: "Ritual Monster enabled by Black Magic Ritual; strong body with a hand-cost removal effect." },
      { name: "Knight's Title", role: "SUPPORT", packageTier: "EXPANSION", needsReview: true, notes: "Special Summons Buster Blader or Dark Paladin under conditions - exact wording not independently re-verified this pass." },
      { name: "The Eye of Timaeus", role: "NICHE", packageTier: "EXPANSION", notes: "GX-movie Equip Spell boosting a Spellcaster's ATK; situational." },
      { name: "Dark Magic Attack", role: "SUPPORT", packageTier: "EXPANSION", notes: "Destroys a Set Trap Card while you control Dark Magician - narrow, matchup-dependent removal." },
      { name: "Magic Formula", role: "UTILITY", packageTier: "EXPANSION", notes: "Equip Spell granting ATK to a Spellcaster and drawing a card on destruction." },
      { name: "Dark Eradicator Warlock", role: "NICHE", packageTier: "EXPANSION", notes: "Negates an opponent's flip effect whenever a Spell resolves - narrow disruption." },
      { name: "Dark Sage", role: "NICHE", packageTier: "EXPANSION", needsReview: true, notes: "GY-effect tied to reviving Magician of Black Chaos; combo-specific, exact text not fully re-verified." },
      { name: "Amulet Dragon", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "RECOMMENDED", notes: "Fusion of 1 Spellcaster-Type + 1 Dragon-Type monster - generic-ish materials, real accessible boss." },
      { name: "Dark Paladin", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: "RECOMMENDED", notes: "Fusion of Dark Magician + Buster Blader - the classic named 2-card anime combo; the archetype's signature capstone." },
      { name: "Dark Magician Girl the Dragon Knight", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "RECOMMENDED", notes: "Fusion of Dark Magician Girl + 1 Dragon-Type monster - the first realistically accessible Fusion boss." },
      { name: "Dark Flare Knight", role: "NICHE", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: null, needsReview: true, notes: "Catalogued under Dark Magician but this pass could not confidently verify a real functional tie to Dark Magician synergy (its known materials involve Flame Swordsman); held for human review rather than asserted." },
      { name: "Chocolate Magician Girl", role: "SUPPORT", packageTier: "EXPANSION", notes: "Magician Girl-archetype beater/support; the brief's own model whitelist example (already included via the base format's own override seed, migration 202608300900)." },
    ],
  },
  {
    code: "elemental_hero",
    name: "Elemental HERO",
    archetypeTags: ["Elemental HERO", "HERO", "Masked HERO"],
    priorityRank: 2,
    description:
      "Jaden Yuki's HERO lineup: five foundational Normal Monsters that combine into one of the deepest Fusion boss lineups of any archetype in this format, backed by best-in-class searchers (Stratos, E - Emergency Call, Bubbleman) and the Skyscraper Field Spell package.",
    profile: {
      nostalgiaRelevance: "HIGH",
      consistency: "HIGH",
      removal: "MEDIUM",
      defense: "LOW",
      recovery: "MEDIUM",
      bossPower: "HIGH",
      summoningSpeed: "FAST",
      overallHealth: "STRONG",
      deckReality: "FULL_DECK",
    },
    gaps: [
      {
        category: "removal",
        description:
          "No unconditional single-card removal Spell/Trap - R - Righteous Justice and Wrath of Neos both require a specific board setup, leaving the deck without a clean answer to an opposing floodgate before its own plan comes online.",
      },
      {
        category: "other",
        description:
          "A long tail of 2010-2011 Fusion Monsters (Absolute Zero, Electrum, The Shining, Divine Neos, Magma Neos, Nova Master, Wildedge, Necroid Shaman, Darkbright, Plasma Vice, Tempest, Neos Knight, Steam Healer) have exact Fusion-material text this pass could not independently verify with confidence - flagged needsReview rather than asserted, and held out of ESSENTIAL/RECOMMENDED until a human confirms the real card text.",
      },
    ],
    bossProgression: {
      early: "Elemental HERO Flame Wingman",
      mid: "Elemental HERO Gaia",
      late: "Masked HERO Goka",
      signature: "Elemental HERO Shining Flare Wingman",
      note: "Elemental HERO Chaos Neos and Elemental HERO Phoenix Enforcer are also real signature-tier candidates (see their own notes below); Shining Flare Wingman was picked as the single ladder-topper to avoid diluting the SIGNATURE slot across three cards.",
    },
    notes:
      "overallHealth is set to STRONG rather than HEALTHY on purpose: this is genuinely the best-supported archetype in the current eligible pool (best consistency, deepest Fusion lineup, fastest starts) and the brief explicitly warns not to under-report that just to flatten the archetype list - the honest read is that this is where power-level attention should focus if the format needs rebalancing later, not that individual cards need nerfing now.",
    cards: [
      { name: "Elemental HERO Avian", role: "CORE", packageTier: "ESSENTIAL", notes: "Foundational Normal Monster; Fusion material for Flame Wingman." },
      { name: "Elemental HERO Burstinatrix", role: "CORE", packageTier: "ESSENTIAL", notes: "Foundational Normal Monster; Fusion material for Flame Wingman." },
      { name: "Elemental HERO Sparkman", role: "CORE", packageTier: "ESSENTIAL", notes: "Foundational Normal Monster; Fusion material for Thunder Giant." },
      { name: "Elemental HERO Clayman", role: "CORE", packageTier: "ESSENTIAL", notes: "Foundational Normal Monster; Fusion material for Thunder Giant/Gaia line." },
      { name: "Elemental HERO Neos", role: "CORE", packageTier: "ESSENTIAL", notes: "Foundational Normal Monster; base of the entire Neos-Fusion sub-line." },
      { name: "Elemental HERO Stratos", role: "CORE", packageTier: "ESSENTIAL", notes: "On-summon search for any HERO card or draw - the deck's single best consistency card." },
      { name: "Elemental HERO Bubbleman", role: "CORE", packageTier: "ESSENTIAL", notes: "Special Summonable from hand with no other cards on board, draws 2 alone - key opener/consistency piece." },
      { name: "Elemental HERO Prisma", role: "CORE", packageTier: "RECOMMENDED", notes: "Banishes itself to add a Fusion Monster, or fuels Fusion Summons as material fuel - strong Fusion enabler." },
      { name: "Elemental HERO Neos Alius", role: "CORE", packageTier: "RECOMMENDED", notes: "Gemini Monster; searches a HERO Spell/Trap once treated as Normal Summoned again." },
      { name: "Elemental HERO Bladedge", role: "CORE", packageTier: "RECOMMENDED", notes: "Strong Main Deck beater dealing damage equal to the ATK difference in battle." },
      { name: "E - Emergency Call", role: "CORE", packageTier: "ESSENTIAL", notes: "Adds any Elemental HERO monster from GY or Deck to hand - one of the format's most efficient archetype searchers." },
      { name: "Miracle Fusion", role: "CORE", packageTier: "ESSENTIAL", notes: "Banishes Elemental HERO materials from field/GY to Fusion Summon - the single card that makes the whole Fusion lineup function." },
      { name: "Skyscraper", role: "CORE", packageTier: "ESSENTIAL", notes: "Iconic Field Spell boosting HERO ATK vs higher-ATK monsters in battle - archetype-defining." },
      { name: "HERO's Bond", role: "CORE", packageTier: "RECOMMENDED", notes: "Special Summons two HERO monsters from hand if you control none - real consistency piece." },
      { name: "A Hero Lives", role: "CORE", packageTier: "RECOMMENDED", notes: "If this is your only card in hand, Special Summon a Level 4 or lower HERO from Deck - strong opener." },
      { name: "Skyscraper 2 - Hero City", role: "CORE", packageTier: "RECOMMENDED", notes: "Upgrade tying into Skyscraper; real ongoing support." },
      { name: "Hero Flash!!", role: "CORE", packageTier: "RECOMMENDED", notes: "Quick-Play Special Summon of a Fusion Monster from the Extra Deck by banishing its materials - instant-speed alternate Fusion access." },
      { name: "Elemental HERO Flame Wingman", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "EASY", packageTier: "ESSENTIAL", notes: "Fusion of Avian + Burstinatrix - the deck's most accessible boss, deals piercing-adjacent burn on battle destruction." },
      { name: "Elemental HERO Thunder Giant", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "EASY", packageTier: "ESSENTIAL", notes: "Fusion of Sparkman + Clayman - accessible boss with a destroy-and-remove-defense effect." },
      { name: "Elemental HERO Gaia", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "RECOMMENDED", notes: "Fusion of 1 Elemental HERO + 1 Warrior-Type monster - generic-ish materials, real mid-game upgrade." },
      { name: "Masked HERO Goka", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "RECOMMENDED", notes: "Special Summoned via Mask Change (2015-2018 whitelist) using any face-up HERO you control - real instant-speed upgrade path." },
      { name: "Masked HERO Vapor", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "RECOMMENDED", notes: "Same Mask Change access pattern as Goka; a defensive/control-oriented Masked HERO option." },
      { name: "Masked HERO Dian", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "RECOMMENDED", notes: "Same Mask Change access pattern as Goka; a LP-recovery-oriented Masked HERO option." },
      { name: "Elemental HERO Shining Flare Wingman", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: "RECOMMENDED", notes: "Named upgrade of Flame Wingman - iconic anime capstone, picked as the archetype's SIGNATURE boss." },
      { name: "Elemental HERO Chaos Neos", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: "RECOMMENDED", notes: "Requires a LIGHT and a DARK Elemental HERO as material - constrained-but-not-fully-named; a real signature-tier alternative capstone (see the human calibration brief's own worked example)." },
      { name: "Elemental HERO Phoenix Enforcer", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "VERY_HARD", packageTier: "EXPANSION", needsReview: true, notes: "Big multi-material HERO Fusion; exact required materials not independently re-verified this pass with full confidence." },
      { name: "Elemental HERO Shining Phoenix Enforcer", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: "EXPANSION", notes: "Upgrade requiring multiple Elemental HERO monsters as material - accessible in a HERO-heavy build." },
      { name: "Elemental HERO Flare Neos", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "RECOMMENDED", notes: "Fusion of Neos + Neo-Spacian Flare Scarab - real, well-supported Neos sub-line boss." },
      { name: "Elemental HERO Dark Neos", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss." },
      { name: "Elemental HERO Storm Neos", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss." },
      { name: "Elemental HERO Glow Neos", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss." },
      { name: "Elemental HERO Aqua Neos", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss." },
      { name: "Elemental HERO Grand Neos", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of Neos + a Neo-Spacian partner - Neos sub-line boss." },
      { name: "Rainbow Neos", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "VERY_HARD", packageTier: "EXPANSION", notes: "Requires Neos plus multiple named Neo-Spacians - an intentionally hard-to-assemble capstone, the Neos-line equivalent of Rainbow Overdragon." },
      { name: "Elemental HERO Absolute Zero", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "VERY_HARD", packageTier: "EXPANSION", needsReview: true, notes: "Historically a narrow named 2-card lock; exact required names not independently re-verified this pass." },
      { name: "Elemental HERO Great Tornado", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of 1 Elemental HERO + 1 Warrior-Type monster - late-game upgrade in the same generic-material family as Gaia." },
      { name: "Elemental HERO Terra Firma", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of 1 Elemental HERO + 1 Warrior-Type monster." },
      { name: "Elemental HERO Mudballman", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of 1 Elemental HERO + 1 EARTH monster." },
      { name: "Elemental HERO Wild Wingman", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of 1 Elemental HERO + 1 Warrior-Type monster." },
      { name: "Elemental HERO Escuridao", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of 1 Elemental HERO + 1 DARK monster." },
      { name: "Elemental HERO Inferno", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of 1 Elemental HERO + 1 FIRE monster." },
      { name: "Elemental HERO Rampart Blaster", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of 1 Elemental HERO + 1 EARTH monster." },
      { name: "Elemental HERO Mariner", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", notes: "Fusion of 1 Elemental HERO + 1 WATER monster." },
      { name: "Elemental HERO Neos Knight", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", needsReview: true, notes: "Likely Neos + Warrior-Type material; not independently re-verified this pass." },
      { name: "Elemental HERO Darkbright", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", needsReview: true, notes: "Exact material text not independently re-verified this pass." },
      { name: "Elemental HERO Plasma Vice", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", needsReview: true, notes: "Exact material text not independently re-verified this pass." },
      { name: "Elemental HERO Tempest", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", needsReview: true, notes: "Exact material text not independently re-verified this pass." },
      { name: "Elemental HERO Necroid Shaman", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", needsReview: true, notes: "Exact material text not independently re-verified this pass." },
      { name: "Elemental HERO The Shining", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "VERY_HARD", packageTier: "EXPANSION", needsReview: true, notes: "Believed to require several named Elemental HERO monsters; exact list not independently re-verified this pass." },
      { name: "Elemental HERO Nova Master", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: "EXPANSION", needsReview: true, notes: "Exact material text not independently re-verified this pass." },
      { name: "Elemental HERO Wildedge", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: "EXPANSION", needsReview: true, notes: "Exact material text not independently re-verified this pass." },
      { name: "Elemental HERO Electrum", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "VERY_HARD", packageTier: "EXPANSION", needsReview: true, notes: "Believed to require several named Elemental HERO monsters as a capstone; exact list not independently re-verified this pass." },
      { name: "Elemental HERO Magma Neos", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: "EXPANSION", needsReview: true, notes: "Exact material text not independently re-verified this pass." },
      { name: "Elemental HERO Divine Neos", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: "EXPANSION", needsReview: true, notes: "Exact material text not independently re-verified this pass." },
      { name: "Elemental HERO Steam Healer", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "EXPANSION", needsReview: true, notes: "Exact material text not independently re-verified this pass." },
      { name: "Elemental HERO Necroshade", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Lets you treat monsters in GY as banished to pay Fusion/effect costs - real enabler for the Fusion-heavy plan." },
      { name: "Neos Wiseman", role: "SUPPORT", packageTier: "EXPANSION", needsReview: true, notes: "Real-world print is a Fusion Monster (Yubel + Neos), but this project's catalog tags its card_type as an Effect Monster - treated here as Main Deck per the catalog's own field; flagged for a human to confirm which card_type is authoritative before this is trusted as a BOSS/FUSION entry." },
      { name: "Elemental HERO Wildheart", role: "SUPPORT", packageTier: "EXPANSION", notes: "Cannot be targeted by Trap Cards; generic beater." },
      { name: "Elemental HERO Woodsman", role: "NICHE", packageTier: null, notes: "Minor mill/utility effect." },
      { name: "Elemental HERO Poison Rose", role: "NICHE", packageTier: null, notes: "Situational battle-triggered removal." },
      { name: "Elemental HERO Heat", role: "NICHE", packageTier: null, notes: "ATK boost tied to discarding; situational damage on battle destruction." },
      { name: "Elemental HERO Ice Edge", role: "NICHE", packageTier: null, notes: "Low-power utility body." },
      { name: "Elemental HERO Lady Heat", role: "NICHE", packageTier: null, notes: "Minor variant effect." },
      { name: "Elemental HERO Neo Bubbleman", role: "SUPPORT", packageTier: "EXPANSION", needsReview: true, notes: "Bubbleman-line variant; exact text not independently re-verified this pass." },
      { name: "Elemental HERO Captain Gold", role: "NICHE", packageTier: null, needsReview: true, notes: "Later-era print; exact function not independently re-verified this pass." },
      { name: "Elemental HERO Ocean", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact function not independently re-verified this pass." },
      { name: "Elemental HERO Flash", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact function not independently re-verified this pass." },
      { name: "Phantom Magician", role: "AVOID", needsReview: true, notes: "Tagged 'HERO' archetype in the catalog, but this pass found no real functional connection between its effect and Elemental HERO or Destiny HERO strategies - likely a data-tagging artifact; excluded from every package and flagged for a human to check the underlying archetype tag." },
      { name: "Neo Space", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Field Spell boosting Neo-Spacians/Neos-line monsters; enables the Neos sub-line." },
      { name: "Instant Neo Space", role: "SUPPORT", packageTier: "EXPANSION", notes: "Quick-Play version of Neo Space." },
      { name: "Reverse of Neos", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Recovery Spell for the Neos-line." },
      { name: "Miracle Contact", role: "CORE", packageTier: "RECOMMENDED", notes: "Contact Fusion enabler for Neos-line Fusion Monsters, skipping Polymerization - key enabler for the Neos sub-line." },
      { name: "Parallel World Fusion", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Returns banished HERO/Neo-Spacian materials to fuel another Fusion Summon - real recursion/extension piece." },
      { name: "Fake Hero", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Special Summons a Level 4 or lower HERO from hand, ignoring its own summoning conditions - real consistency piece." },
      { name: "O - Oversoul", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Special Summons a Normal Monster from GY - fits the deck's five Normal Monster originals as a recovery piece." },
      { name: "R - Righteous Justice", role: "SUPPORT", packageTier: "EXPANSION", notes: "Destroys Spell/Traps while you control an 'R'-named HERO - situational removal." },
      { name: "Wrath of Neos", role: "SUPPORT", packageTier: "EXPANSION", notes: "Board-wipe effect tied to the Neos-line; powerful but requires setup." },
      { name: "Bubble Blaster", role: "UTILITY", packageTier: "EXPANSION", notes: "Equip Spell granting Bubbleman extra utility." },
      { name: "Bubble Shuffle", role: "SUPPORT", packageTier: "EXPANSION", notes: "Bounces a monster - situational tempo/removal." },
      { name: "Bubble Illusion", role: "NICHE", packageTier: null, needsReview: true, notes: "Bubbleman-line support; exact text not independently re-verified this pass." },
      { name: "Change of Hero - Reflector Ray", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Bounces a card and draws for a HERO-related cost - real value Trap." },
      { name: "Cyclone Boomerang", role: "SUPPORT", packageTier: "EXPANSION", notes: "Recyclable Spell/Trap-adjacent removal." },
      { name: "Spark Blaster", role: "NICHE", packageTier: null, notes: "Equip changing an opponent monster's battle position." },
      { name: "Hero Mask", role: "NICHE", packageTier: null, needsReview: true, notes: "Situational protection; exact text not independently re-verified this pass." },
      { name: "Hero Barrier", role: "SUPPORT", packageTier: "EXPANSION", notes: "Negates an attack targeting your HERO monster - situational protection." },
      { name: "Hero Signal", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Special Summons a Level 4 or lower HERO from Deck when your monster is destroyed by battle - real defensive recovery." },
      { name: "Hero Counterattack", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Hero Heart", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Hero Blast", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Hero Spirit", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Feather Shot", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Feather Wind", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Edge Hammer", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Kid Guard", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Fifth Hope", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Rose Bud", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Clay Charge", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Terra Firma Gravity", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Mirror Gate", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Burst Return", role: "NICHE", packageTier: null, notes: "Bounces your own HERO(s) for a reset/value line - situational." },
    ],
  },
  {
    code: "blue_eyes",
    name: "Blue-Eyes",
    archetypeTags: ["Blue-Eyes"],
    priorityRank: 3,
    description:
      "Seto Kaiba's signature dragon line: Blue-Eyes White Dragon and its Ritual/Fusion upgrades, with a small but real set of hand-summon enablers.",
    profile: {
      nostalgiaRelevance: "HIGH",
      consistency: "MEDIUM",
      removal: "LOW",
      defense: "LOW",
      recovery: "LOW",
      bossPower: "HIGH",
      summoningSpeed: "MEDIUM",
      overallHealth: "WEAK",
      deckReality: "ENGINE_PLUS_GENERIC",
    },
    gaps: [
      {
        category: "consistency",
        description:
          "Has bosses (Blue-Eyes Ultimate Dragon, Dragon Master Knight) but insufficient consistency - only 3 real enablers (The White Stone of Legend, Kaibaman, Maiden with Eyes of Blue) exist to reliably find or summon Blue-Eyes White Dragon before the deck can reach for its Fusion bosses.",
      },
      {
        category: "xyz_access",
        description:
          "Zero Xyz Monsters and no Level 4 generic body exist in the eligible pool - the deck cannot use the Xyz half of this format's Extra Deck at all.",
      },
      {
        category: "removal",
        description:
          "Burst Stream of Destruction is the only removal card, and it requires Blue-Eyes White Dragon already on the field to activate.",
      },
    ],
    bossProgression: {
      early: null,
      mid: "Blue-Eyes Ultimate Dragon",
      late: null,
      signature: "Dragon Master Knight",
      note: "Only 2 real Fusion Monsters exist for this archetype - EARLY and LATE are left unfilled rather than forcing a Main Deck card into an Extra Deck progression slot.",
    },
    notes: null,
    cards: [
      { name: "Blue-Eyes White Dragon", role: "CORE", packageTier: "ESSENTIAL", notes: "Namesake Normal Monster." },
      { name: "The White Stone of Legend", role: "CORE", packageTier: "ESSENTIAL", notes: "Adds Blue-Eyes White Dragon from Deck to hand on Normal Summon - the archetype's iconic searcher." },
      { name: "Kaibaman", role: "CORE", packageTier: "ESSENTIAL", notes: "Discards itself to Special Summon Blue-Eyes White Dragon from hand - strong consistency piece." },
      { name: "Maiden with Eyes of Blue", role: "CORE", packageTier: "RECOMMENDED", notes: "Searches/Special Summons Blue-Eyes monsters - key consistency piece." },
      { name: "Burst Stream of Destruction", role: "CORE", packageTier: "ESSENTIAL", notes: "Destroys all opponent's monsters while you control Blue-Eyes White Dragon - the archetype's removal answer." },
      { name: "Paladin of White Dragon", role: "SUPPORT", extraDeckKind: null, packageTier: "RECOMMENDED", notes: "Ritual Monster support tied to Blue-Eyes; enables a small Ritual sub-package." },
      { name: "Blue-Eyes Shining Dragon", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Strong Main Deck beater/effect body; flagged borderline Ultra/Secret in the human calibration pass." },
      { name: "Malefic Blue-Eyes White Dragon", role: "NICHE", packageTier: null, notes: "High-risk/high-reward body tied to a field-spell-lock condition; situational." },
      { name: "Blue-Eyes Ultimate Dragon", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "VERY_HARD", packageTier: "RECOMMENDED", notes: "Fusion of 3 named Blue-Eyes White Dragon - the archetype's iconic capstone." },
      { name: "Dragon Master Knight", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "VERY_HARD", packageTier: "EXPANSION", needsReview: true, notes: "Ultimate crossover capstone Fusion; exact required materials not independently re-verified this pass." },
    ],
  },
  {
    code: "red_eyes",
    name: "Red-Eyes",
    archetypeTags: ["Red-Eyes"],
    priorityRank: 4,
    description:
      "Joey Wheeler's Red-Eyes Black Dragon line - a Normal Monster core with real upgrade and recursion support, now reinforced by the 2015-2018 whitelist's Fusion package.",
    profile: {
      nostalgiaRelevance: "HIGH",
      consistency: "MEDIUM",
      removal: "LOW",
      defense: "LOW",
      recovery: "MEDIUM",
      bossPower: "MEDIUM",
      summoningSpeed: "MEDIUM",
      overallHealth: "HEALTHY",
      deckReality: "ENGINE_PLUS_GENERIC",
    },
    gaps: [
      {
        category: "fusion_spell",
        description:
          "Has Fusion identity (Meteor Black Dragon, and now Red-Eyes Fusion / Red-Eyes Black Dragon Sword from the 2015-2018 whitelist) but lacks enough reliable Main Deck setup - no searcher finds Meteor Black Dragon specifically, and the deck still has no unconditional removal.",
      },
      {
        category: "removal",
        description:
          "Inferno Fire Blast is the only removal-adjacent card and requires Red-Eyes Black Dragon already on the field.",
      },
    ],
    bossProgression: {
      early: "Red-Eyes Black Dragon Sword",
      mid: "Meteor Black Dragon",
      late: null,
      signature: null,
      note: "No larger post-Meteor-Black-Dragon boss exists in the current eligible+whitelisted pool - LATE and SIGNATURE are left unfilled rather than forcing a pick.",
    },
    notes:
      "Red-Eyes Fusion, Red-Eyes Black Dragon Sword, and The Black Stone of Legend are sourced from the 2015-2018 legacy support whitelist (migration 202608301200_seed_2015_2018_legacy_support_whitelist.sql) - included here per the brief's instruction to integrate that whitelist into the registry.",
    cards: [
      { name: "Red-Eyes Black Dragon", role: "CORE", packageTier: "ESSENTIAL", notes: "Namesake Normal Monster." },
      { name: "The Black Stone of Legend", role: "CORE", packageTier: "ESSENTIAL", notes: "On-summon searcher for Red-Eyes Black Dragon, the Red-Eyes counterpart to White Stone of Legend. From 2015-2018 whitelist." },
      { name: "Red-Eyes Wyvern", role: "CORE", packageTier: "RECOMMENDED", notes: "Searches Red-Eyes cards on summon - consistency piece." },
      { name: "Red-Eyes Black Metal Dragon", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Direct upgrade of Red-Eyes Black Dragon with added protection/effect." },
      { name: "Red-Eyes Darkness Metal Dragon", role: "SUPPORT", packageTier: "EXPANSION", needsReview: true, notes: "Further upgrade requiring Red-Eyes Black Metal Dragon; exact Special Summon condition not independently re-verified this pass." },
      { name: "Red-Eyes Darkness Dragon", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Gains ATK and has GY-recovery utility - real recovery piece." },
      { name: "Red-Eyes Zombie Dragon", role: "SUPPORT", packageTier: "EXPANSION", notes: "Recursive body Special-Summonable under Zombie-support conditions." },
      { name: "Black Dragon's Chick", role: "SUPPORT", packageTier: "EXPANSION", notes: "Classic searcher/evolution piece with a randomness element (dice-roll based)." },
      { name: "Inferno Fire Blast", role: "CORE", packageTier: "RECOMMENDED", notes: "Deals damage equal to Red-Eyes Black Dragon's ATK while it's on the field - the archetype's reach/removal-adjacent finisher." },
      { name: "Meteor Black Dragon", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: "RECOMMENDED", notes: "Fusion of Red-Eyes Black Dragon + Meteor Dragon, both named - the archetype's pre-whitelist Fusion boss." },
      { name: "Red-Eyes Fusion", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Fusion Summons a named 'Red-Eyes' Fusion Monster using materials from hand/field including 1 Dragon-Type monster - Fusion enabler. From 2015-2018 whitelist." },
      { name: "Red-Eyes Black Dragon Sword", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "EASY", packageTier: "RECOMMENDED", notes: "2-material Fusion (Red-Eyes B. Dragon line + a Warrior-Type monster) that becomes a recoverable Equip Spell after leaving the field. From 2015-2018 whitelist." },
    ],
  },
  {
    code: "cyber_dragon",
    name: "Cyber Dragon",
    archetypeTags: ["Cyber Dragon"],
    priorityRank: 5,
    description:
      "A Machine-Type engine built around free Special Summons when you control no monsters and your opponent controls at least one, feeding a compact Rank-4/5 Xyz lineup.",
    profile: {
      nostalgiaRelevance: "HIGH",
      consistency: "HIGH",
      removal: "LOW",
      defense: "MEDIUM",
      recovery: "MEDIUM",
      bossPower: "HIGH",
      summoningSpeed: "FAST",
      overallHealth: "HEALTHY",
      deckReality: "ENGINE_PLUS_GENERIC",
    },
    gaps: [
      {
        category: "removal",
        description:
          "No dedicated destruction/removal Spell or Trap outside Cyber Dragon Infinity's own negation once it is already summoned - the deck has speed and Xyz access but no answer to a board it hasn't already beaten.",
      },
      {
        category: "other",
        description:
          "Only 2 real Xyz Monsters exist for the archetype (Nova, Infinity) - healthy for a Rank-4-centric engine, but the deck still needs generic Machine-Type filler to reach 40 cards, matching its ENGINE_PLUS_GENERIC classification rather than FULL_DECK.",
      },
    ],
    bossProgression: {
      early: "Cyber Dragon Nova",
      mid: null,
      late: null,
      signature: "Cyber Dragon Infinity",
      note: "Only 2 real Xyz Monsters exist - MID and LATE are left unfilled rather than forcing a Main Deck card into an Extra Deck progression slot.",
    },
    notes: null,
    cards: [
      { name: "Cyber Dragon", role: "CORE", packageTier: "ESSENTIAL", notes: "Namesake free-Special-Summon body when you control no monsters and the opponent controls one." },
      { name: "Cyber Dragon Core", role: "CORE", packageTier: "ESSENTIAL", notes: "Smaller free-Special-Summon body and Xyz material enabler." },
      { name: "Cyber Dragon Zwei", role: "CORE", packageTier: "RECOMMENDED", notes: "Free-Special-Summon variant with an additional searcher/support effect." },
      { name: "Cyber Dragon Drei", role: "CORE", packageTier: "RECOMMENDED", notes: "Free-Special-Summon variant reinforcing the archetype's central swarm-for-Xyz gameplan." },
      { name: "Proto-Cyber Dragon", role: "SUPPORT", packageTier: "EXPANSION", notes: "Earlier, weaker free-Special-Summon variant." },
      { name: "Cyber Network", role: "CORE", packageTier: "RECOMMENDED", notes: "Real searcher for Cyber Dragon cards - key consistency piece." },
      { name: "Cyber Repair Plant", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Recovers/searches Cyber monsters." },
      { name: "Attack Reflector Unit", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Special Summons a Cyber monster and negates an attack - real defensive piece." },
      { name: "Armored Cybern", role: "SUPPORT", extraDeckKind: null, packageTier: "EXPANSION", notes: "Union Monster equipping to a Machine-Type for a stat boost/protection." },
      { name: "Evolution Burst", role: "SUPPORT", packageTier: "EXPANSION", needsReview: true, notes: "Special Summon/tutor effect for a Cyber Dragon variant under specific conditions; exact text not independently re-verified this pass." },
      { name: "Photon Generator Unit", role: "SUPPORT", packageTier: "EXPANSION", notes: "Special Summons a Machine-Type from hand under an LP-cost condition." },
      { name: "Cybernetic Hidden Technology", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Cyber Dragon Nova", role: "BOSS", extraDeckKind: "XYZ", summonDifficulty: "EASY", packageTier: "RECOMMENDED", notes: "Rank 4/5 Xyz built from the archetype's own generic-Level bodies - the archetype's accessible early Xyz boss." },
      { name: "Cyber Dragon Infinity", role: "BOSS", extraDeckKind: "XYZ", summonDifficulty: "MODERATE", packageTier: "RECOMMENDED", notes: "Higher Rank Xyz with negation - the archetype's signature boss." },
    ],
  },
  {
    code: "ancient_gear",
    name: "Ancient Gear",
    archetypeTags: ["Ancient Gear"],
    priorityRank: 6,
    description:
      "A slow, heavy-hitting Machine-Type archetype built around Ancient Gear Golem and Geartown, reinforced by a strong 2015-2018 Fusion package.",
    profile: {
      nostalgiaRelevance: "HIGH",
      consistency: "MEDIUM",
      removal: "MEDIUM",
      defense: "LOW",
      recovery: "LOW",
      bossPower: "HIGH",
      summoningSpeed: "SLOW",
      overallHealth: "HEALTHY",
      deckReality: "FULL_DECK",
    },
    gaps: [
      {
        category: "xyz_access",
        description:
          "Zero Xyz Monsters in the eligible pool - Ancient Gear's entire Extra Deck presence is its Fusion line; the archetype cannot use the Xyz half of this format at all.",
      },
      {
        category: "recovery",
        description:
          "No dedicated recursion or graveyard-recovery Spell/Trap - once the deck's few searchers and beaters are spent, it has no way to rebuild.",
      },
    ],
    bossProgression: {
      early: "Ancient Gear Golem",
      mid: "Ancient Gear Howitzer",
      late: "Chaos Ancient Gear Giant",
      signature: "Ultimate Ancient Gear Golem",
      note: null,
    },
    notes:
      "Chaos Ancient Gear Giant, Ancient Gear Fusion, and Ancient Gear Howitzer are sourced from the 2015-2018 legacy support whitelist (migration 202608301200) - integrated here per the brief's instruction.",
    cards: [
      { name: "Ancient Gear Golem", role: "CORE", packageTier: "ESSENTIAL", notes: "Namesake beater; opponent cannot activate Spell/Trap Cards during your Battle Phase while it's on the field." },
      { name: "Ancient Gear Engineer", role: "CORE", packageTier: "ESSENTIAL", notes: "Adds an Ancient Gear card on summon - the deck's key consistency piece." },
      { name: "Ancient Gear Soldier", role: "CORE", packageTier: "RECOMMENDED", notes: "Real Main Deck beater/support body." },
      { name: "Ancient Gear Beast", role: "CORE", packageTier: "RECOMMENDED", notes: "Strong beater with immunity-to-targeting and extra-attack-adjacent effect; rated Ultra Rare in the human calibration pass." },
      { name: "Ancient Gear Cannon", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Burn/removal-adjacent effect." },
      { name: "Ancient Gear Gadjiltron Chimera", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Cannot be destroyed by battle - strong beater." },
      { name: "Ancient Gear Gadjiltron Dragon", role: "SUPPORT", packageTier: "EXPANSION", notes: "Strong beater line, similar role to Gadjiltron Chimera." },
      { name: "Ancient Gear Knight", role: "SUPPORT", extraDeckKind: null, packageTier: "RECOMMENDED", notes: "Gemini Monster; searcher-ish consistency once treated as Normal Summoned again." },
      { name: "Ancient Gear Box", role: "NICHE", packageTier: null, notes: "Minor Flip/trigger utility effect." },
      { name: "Geartown", role: "CORE", packageTier: "ESSENTIAL", notes: "Iconic Field Spell reducing summon costs and enabling recursion - archetype-defining." },
      { name: "Ancient Gear Factory", role: "CORE", packageTier: "RECOMMENDED", notes: "Repeatable Special Summon engine card." },
      { name: "Ancient Gear Castle", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Continuous Spell with searcher/floodgate-ish utility." },
      { name: "Ancient Gear Explosive", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Removal-oriented Spell - fills part of the removal gap." },
      { name: "Ancient Gear Workshop", role: "SUPPORT", packageTier: "EXPANSION", notes: "Cost reduction for Tribute Summons." },
      { name: "Ancient Gear Tank", role: "UTILITY", packageTier: "EXPANSION", notes: "Equip Spell granting piercing damage." },
      { name: "Ancient Gear Fist", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Ancient Gear Drill", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Spell Gear", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Ultimate Ancient Gear Golem", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: "RECOMMENDED", needsReview: true, notes: "The archetype's premier Fusion boss; exact required materials not independently re-verified this pass with full confidence." },
      { name: "Chaos Ancient Gear Giant", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "RECOMMENDED", notes: "Fusion of Ancient Gear Golem + 1 DARK monster; opponent cannot respond to its attacks - archetype-defining. From 2015-2018 whitelist." },
      { name: "Ancient Gear Fusion", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Dedicated Fusion Summon enabler for the archetype's Machine-Type monsters. From 2015-2018 whitelist." },
      { name: "Ancient Gear Howitzer", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "MODERATE", packageTier: "RECOMMENDED", notes: "Fusion of 2 Machine-Type monsters - a lower-power, more accessible Fusion option. From 2015-2018 whitelist." },
    ],
  },
  {
    code: "crystal_beast",
    name: "Crystal Beast",
    archetypeTags: ["Crystal Beast", "Advanced Crystal Beast"],
    priorityRank: 7,
    description:
      "Rex Raptor's rainbow-gem monsters, which move to the Spell/Trap Zone to power a distinctive resource-recursion engine and two capstone bosses.",
    profile: {
      nostalgiaRelevance: "MEDIUM",
      consistency: "HIGH",
      removal: "MEDIUM",
      defense: "LOW",
      recovery: "MEDIUM",
      bossPower: "HIGH",
      summoningSpeed: "MEDIUM",
      overallHealth: "HEALTHY",
      deckReality: "FULL_DECK",
    },
    gaps: [
      {
        category: "xyz_access",
        description:
          "Zero Xyz Monsters in the eligible pool, the same structural gap as Ancient Gear - the archetype's entire Extra Deck presence is its two 7-material capstone bosses.",
      },
      {
        category: "level_4_body",
        description:
          "No Level 4 Crystal Beast monster exists at all - the six gem beasts run outside that band, leaving no clean Xyz material even where the format would otherwise allow it.",
      },
    ],
    bossProgression: {
      early: "Crystal Beast Ruby Carbuncle",
      mid: null,
      late: "Rainbow Dragon",
      signature: "Rainbow Overdragon",
      note: "No distinct MID-tier boss exists between Ruby Carbuncle's engine role and the two 7-material capstones.",
    },
    notes:
      "Advanced Crystal Beast has zero real eligible cards in the current catalog and is not otherwise represented in this registry entry - a genuine reported gap, not an omission.",
    cards: [
      { name: "Crystal Beast Ruby Carbuncle", role: "CORE", packageTier: "ESSENTIAL", notes: "Special Summons itself and sends Crystal Beasts to the Spell/Trap Zone - the archetype's consistency lynchpin." },
      { name: "Crystal Beast Topaz Tiger", role: "CORE", packageTier: "ESSENTIAL", notes: "One of the six core gem beasts; central to the archetype's field-to-Spell/Trap-Zone gimmick." },
      { name: "Crystal Beast Sapphire Pegasus", role: "CORE", packageTier: "ESSENTIAL", notes: "One of the six core gem beasts." },
      { name: "Crystal Beast Amethyst Cat", role: "CORE", packageTier: "ESSENTIAL", notes: "One of the six core gem beasts." },
      { name: "Crystal Beast Amber Mammoth", role: "CORE", packageTier: "ESSENTIAL", notes: "One of the six core gem beasts." },
      { name: "Crystal Beast Emerald Tortoise", role: "CORE", packageTier: "ESSENTIAL", notes: "One of the six core gem beasts." },
      { name: "Crystal Beast Cobalt Eagle", role: "CORE", packageTier: "ESSENTIAL", notes: "One of the six core gem beasts." },
      { name: "Rainbow Dragon", role: "BOSS", packageTier: "RECOMMENDED", notes: "Special Summoned by returning all 7 Crystal Beasts to hand/field - the archetype's premier boss. Main Deck per this catalog's card_type, not Extra Deck." },
      { name: "Ancient City - Rainbow Ruins", role: "CORE", packageTier: "ESSENTIAL", notes: "Identity Field Spell; returns Crystal Beasts from GY to the Spell/Trap Zone." },
      { name: "Crystal Beacon", role: "CORE", packageTier: "RECOMMENDED", notes: "Real searcher for Crystal Beast monsters." },
      { name: "Crystal Promise", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Tutors/searches toward the engine." },
      { name: "Crystal Blessing", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Returns a Crystal Beast to hand from GY - recovery piece." },
      { name: "Crystal Abundance", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Board-wipe tied to controlling several Crystal Beasts in the Spell/Trap Zone - fills the removal gap." },
      { name: "Crystal Raigeki", role: "CORE", packageTier: "RECOMMENDED", notes: "Destroys monsters based on Crystal Beasts in the Spell/Trap Zone - key removal piece." },
      { name: "Rainbow Gravity", role: "CORE", packageTier: "RECOMMENDED", notes: "Sets up multiple Crystal Beasts into the Spell/Trap Zone in one shot, directly enabling Rainbow Dragon." },
      { name: "Crystal Tree", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Rare Value", role: "NICHE", packageTier: null, needsReview: true, notes: "Believed to be a rarity-based burn effect; gimmicky, exact text not independently re-verified this pass." },
      { name: "Crystal Release", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Advanced Dark", role: "NICHE", packageTier: null, needsReview: true, notes: "Possible catalog mistag; exact connection to Crystal Beast not independently re-verified this pass." },
      { name: "Counter Gem", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Crystal Pair", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Rainbow Path", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Rainbow Overdragon", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "VERY_HARD", packageTier: "RECOMMENDED", notes: "Requires all 7 named Crystal Beast monsters as material - an intentionally hard-to-assemble capstone reward. From 2015-2018 whitelist." },
    ],
  },
  {
    code: "destiny_hero",
    name: "Destiny HERO",
    archetypeTags: ["Destiny HERO"],
    priorityRank: 8,
    description:
      "Aster Phoenix's dark HERO counterpart line, built around discard-for-value (Destiny Draw) and graveyard recursion, capped by a single named Fusion boss.",
    profile: {
      nostalgiaRelevance: "MEDIUM",
      consistency: "MEDIUM",
      removal: "LOW",
      defense: "MEDIUM",
      recovery: "MEDIUM",
      bossPower: "MEDIUM",
      summoningSpeed: "MEDIUM",
      overallHealth: "HEALTHY",
      deckReality: "FULL_DECK",
    },
    gaps: [
      {
        category: "removal",
        description:
          "Only conditional interaction exists (Doom Lord's flip-negate, Captain Tenacious's GY-banish Trap-negate) - no unconditional destruction or removal card in the eligible pool.",
      },
      {
        category: "boss",
        description:
          "Extra Deck presence is a single Fusion Monster (Destiny End Dragoon) that depends on the 2015-2018 whitelisted D-Fusion - until that whitelist is activated, the archetype has no working Extra Deck boss.",
      },
    ],
    bossProgression: {
      early: "Destiny HERO - Malicious",
      mid: "Destiny HERO - Blade Master",
      late: null,
      signature: "Destiny End Dragoon",
      note: "No distinct LATE-tier boss exists between the Main Deck beaters and the single Fusion capstone.",
    },
    notes:
      "D-Fusion is sourced from the 2015-2018 legacy support whitelist (migration 202608301200) - it is the only real way to Fusion Summon Destiny End Dragoon in this format. Wroughtweiler is catalogued under the broader 'HERO' archetype tag in card_catalog, but its real function (recurs a Destiny HERO from GY, returns Destiny Draw from GY to hand) is exclusively Destiny HERO recursion, so it is listed here rather than under Elemental HERO.",
    cards: [
      { name: "Destiny HERO - Malicious", role: "CORE", packageTier: "ESSENTIAL", notes: "Special Summons copies of itself from GY - the archetype's core recursion/swarm engine." },
      { name: "Destiny Draw", role: "CORE", packageTier: "ESSENTIAL", notes: "Discards a Destiny HERO to draw 2 - the archetype's signature card-advantage engine." },
      { name: "Destiny HERO - Diamond Dude", role: "CORE", packageTier: "RECOMMENDED", notes: "Reveals the top card of the Deck and can activate Normal Spells directly from it - a unique value engine." },
      { name: "Destiny HERO - Disk Commander", role: "CORE", packageTier: "RECOMMENDED", notes: "Draws 2 when discarded or sent to GY - real value with a discard-heavy shell." },
      { name: "Destiny HERO - Blade Master", role: "CORE", packageTier: "RECOMMENDED", notes: "Gains ATK per Destiny HERO in GY - a real scaling beater and natural mid-game boss." },
      { name: "Destiny HERO - Dogma", role: "CORE", packageTier: "RECOMMENDED", needsReview: true, notes: "Large beater historically important to the archetype; exact effect text not independently re-verified this pass." },
      { name: "Destiny HERO - Plasma", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Banishes an opponent's monster from GY to steal ATK - real value body." },
      { name: "Destiny HERO - Captain Tenacious", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Banishes itself from GY to negate a Trap - rare real interaction/removal for the archetype." },
      { name: "Destiny HERO - Doom Lord", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Flip effect negating a Special Summon - real interaction piece." },
      { name: "Destiny HERO - Double Dude", role: "SUPPORT", packageTier: "EXPANSION", notes: "Special Summons a Destiny HERO Token, generating an extra body." },
      { name: "Destiny HERO - Defender", role: "SUPPORT", packageTier: "EXPANSION", notes: "Defensive wall body; partially addresses the defense gap." },
      { name: "Destiny HERO - Fear Monger", role: "SUPPORT", packageTier: "EXPANSION", notes: "Flip/trigger effect for graveyard setup." },
      { name: "Destiny HERO - Dread Servant", role: "SUPPORT", packageTier: "EXPANSION", notes: "Mills for graveyard setup value." },
      { name: "Destiny HERO - Departed", role: "NICHE", packageTier: null, notes: "On-destruction replacement token; minor value." },
      { name: "Destiny HERO - Dunker", role: "NICHE", packageTier: null, notes: "Switches an opponent monster's battle position." },
      { name: "Destiny HERO - Dreadmaster", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact effect text not independently re-verified this pass." },
      { name: "Destiny HERO - Dasher", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact effect text not independently re-verified this pass." },
      { name: "Destiny End Dragoon", role: "BOSS", extraDeckKind: "FUSION", summonDifficulty: "HARD", packageTier: "RECOMMENDED", notes: "Fusion of a named Destiny HERO monster + a DARK Dragon-Type monster - requires D-Fusion (whitelisted, not yet active) to summon." },
      { name: "Dark City", role: "CORE", packageTier: "RECOMMENDED", notes: "Field Spell tied to Destiny HERO; conditional ATK boost and recursion." },
      { name: "Clock Tower Prison", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Floodgate Field Spell restricting Special Summons based on Destiny HERO count - real interaction/lock piece." },
      { name: "Over Destiny", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Returns a Destiny-named card from GY to hand - recovery piece." },
      { name: "D - Formation", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Cyclone Blade", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Destiny Signal", role: "CORE", packageTier: "RECOMMENDED", notes: "Adds a Destiny HERO from Deck to hand - the archetype's searcher." },
      { name: "D - Fortune", role: "SUPPORT", packageTier: "EXPANSION", needsReview: true, notes: "Protection Trap for Destiny HERO monsters; exact text not independently re-verified this pass." },
      { name: "D - Spirit", role: "SUPPORT", packageTier: "EXPANSION", needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Destiny Mirage", role: "SUPPORT", packageTier: "EXPANSION", needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "D - Shield", role: "SUPPORT", packageTier: "EXPANSION", needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "D - Time", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "D - Chain", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "D - Counter", role: "SUPPORT", packageTier: "EXPANSION", needsReview: true, notes: "Exact text not independently re-verified this pass." },
      { name: "Wroughtweiler", role: "CORE", packageTier: "RECOMMENDED", notes: "Special Summons itself from GY when a Destiny HERO is destroyed, then returns Destiny Draw from GY to hand - real recursion engine for the archetype." },
    ],
  },
  {
    code: "vampire",
    name: "Vampire",
    archetypeTags: ["Vampire"],
    priorityRank: 9,
    description:
      "A DARK Zombie-Type theme built around graveyard-recursive beaters and a single Rank 4 Xyz boss; smaller and more niche than the DM/GX-era archetypes above.",
    profile: {
      nostalgiaRelevance: "LOW",
      consistency: "MEDIUM",
      removal: "LOW",
      defense: "LOW",
      recovery: "LOW",
      bossPower: "MEDIUM",
      summoningSpeed: "MEDIUM",
      overallHealth: "WEAK",
      deckReality: "ENGINE_PLUS_GENERIC",
    },
    gaps: [
      {
        category: "other",
        description:
          "Roughly half the Main Deck monsters (Vampire's Curse, Baby, Duke, Vamp, Lady, Grace, Hunter) have real names confirmed in the catalog, but this pass could not independently verify their exact oracle text with confidence - held at EXPANSION tier and flagged needsReview rather than asserted.",
      },
      {
        category: "searcher",
        description:
          "Only one on-summon searcher (Vampire Sorcerer) exists for a 15-card pool split across many individual effects, leaving consistency lower than the raw card count suggests.",
      },
    ],
    bossProgression: {
      early: "Vampire Lord",
      mid: "Vampire Genesis",
      late: null,
      signature: "Crimson Knight Vampire Bram",
      note: "No distinct LATE-tier boss exists between the Main Deck recursion beaters and the archetype's single Xyz Monster.",
    },
    notes: null,
    cards: [
      { name: "Vampire Lord", role: "CORE", packageTier: "ESSENTIAL", notes: "Classic recurring-from-GY beater, discarding a card as the cost - the archetype's earliest identity piece." },
      { name: "Vampire Genesis", role: "CORE", packageTier: "RECOMMENDED", notes: "Strong Special-Summon-from-GY beater that destroys a monster on that Special Summon - fills the removal gap." },
      { name: "Vampire Sorcerer", role: "CORE", packageTier: "RECOMMENDED", notes: "Searches Vampire cards on summon - the archetype's key consistency piece." },
      { name: "Shadow Vampire", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Mills to search a Vampire monster." },
      { name: "Vampire Dragon", role: "SUPPORT", packageTier: "EXPANSION", notes: "Flip/return-based recursive beater." },
      { name: "Vampire Hunter", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact function not independently re-verified this pass." },
      { name: "Vampire's Curse", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact function not independently re-verified this pass." },
      { name: "Vampire Baby", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact function not independently re-verified this pass." },
      { name: "Vampire Duke", role: "SUPPORT", packageTier: "EXPANSION", needsReview: true, notes: "Exact function not independently re-verified this pass." },
      { name: "Vampire Vamp", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact function not independently re-verified this pass." },
      { name: "Vampire Lady", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact function not independently re-verified this pass." },
      { name: "Vampire Grace", role: "NICHE", packageTier: null, needsReview: true, notes: "Exact function not independently re-verified this pass." },
      { name: "Crimson Knight Vampire Bram", role: "BOSS", extraDeckKind: "XYZ", summonDifficulty: "MODERATE", packageTier: "RECOMMENDED", notes: "Rank 4 Xyz boss, detaches material to inflict damage - the archetype's signature Extra Deck piece." },
      { name: "Vampire Kingdom", role: "CORE", packageTier: "RECOMMENDED", notes: "Field Spell boosting Zombie/Vampire monsters and enabling effects." },
      { name: "Vampire Takeover", role: "SUPPORT", packageTier: "RECOMMENDED", notes: "Searches/Special Summons under a condition." },
    ],
  },
  {
    code: "jinzo",
    name: "Jinzo",
    archetypeTags: ["Jinzo"],
    priorityRank: 10,
    description:
      "A single powerful floodgate identity (negates all Trap Cards) rather than a full archetype - the brief's own example of a legitimate THIN_THEME.",
    profile: {
      nostalgiaRelevance: "MEDIUM",
      consistency: "LOW",
      removal: "LOW",
      defense: "LOW",
      recovery: "LOW",
      bossPower: "MEDIUM",
      summoningSpeed: "FAST",
      overallHealth: "HEALTHY",
      deckReality: "THIN_THEME",
    },
    gaps: [
      {
        category: "other",
        description:
          "Only 4 real cards exist for this identity - by design a THIN_THEME package meant to be run inside a generic Machine/DARK shell rather than a standalone 40-card deck. It has no searcher, no Extra Deck presence, and no archetype-specific removal beyond Jinzo's own passive Trap negation.",
      },
    ],
    bossProgression: {
      early: "Jinzo",
      mid: "Jinzo - Lord",
      late: null,
      signature: null,
      note: "Jinzo does not have four sensible boss-progression stages - it is a 1-2 card package, not a boss ladder. Forcing LATE/SIGNATURE picks would misrepresent its real depth.",
    },
    notes: null,
    cards: [
      { name: "Jinzo", role: "CORE", packageTier: "ESSENTIAL", notes: "Negates all Trap Cards on the field - the archetype's entire reason to exist." },
      { name: "Jinzo - Lord", role: "CORE", packageTier: "RECOMMENDED", notes: "Real strong upgrade to the base Jinzo identity; rated Ultra Rare in the human calibration pass." },
      { name: "Jinzo - Returner", role: "SUPPORT", packageTier: "EXPANSION", notes: "Recursion piece; Special Summons Jinzo from GY under a condition." },
      { name: "Jinzo #7", role: "SUPPORT", packageTier: "EXPANSION", notes: "Weaker pre-evolution/support Jinzo; minor synergy." },
    ],
  },
];
