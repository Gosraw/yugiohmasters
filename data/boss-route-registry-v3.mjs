// data/boss-route-registry-v3.mjs
//
// BOSS ROUTES V3 - the 14 Season 2 Boss Paths (Duelist Circle 2.0).
// Human-maintained source of truth. Generated into SQL by
//   node scripts/generate-boss-routes-v3-migration.mjs
// (-> supabase/migrations/202610301000_boss_routes_v3.sql) and scored by
//   node scripts/boss-route-balance.mjs
// The owner-facing write-up (Dutch) is docs/BOSS_PATHS_V3.md.
//
// Replaces data/boss-route-registry.mjs (the 20 Season 1 routes). The old
// file stays for history and for scripts/cardpool/build-pool.mjs's
// cross-check until that script is pointed here.
//
// SHAPE (same field names as v1, plus a few v3 fields):
//   code            boss_routes.code. "s2_" prefix so the new routes never
//                   collide with the 20 retired Season 1 rows.
//   name            display name
//   displayOrder    1-14
//   identity        whose deck this is, or null. Every route is null since
//                   the owner's 2026-10-30 decision: the three routes the
//                   players already used in Season 1 (Dark Magician, Cyber
//                   Dragon, Armed Dragon & Ojama) were replaced by Ancient
//                   Gear, Crystal Beast and Six Samurai.
//   targetPowerGrade 'A' | 'A+' (the boss_routes check constraint)
//   starProfile     1-5 each: startStrength, growth, bossPower, synergy,
//                   flexibility. The first three are DERIVED from the
//                   balance model so they never drift from it:
//                   startStrength = 4 if Stage 1 power >= 20 else 3,
//                   growth = 4 if Stage 2 + Stage 3 power >= 41 else 3,
//                   bossPower = round(balance.bossImpact / 2). synergy
//                   and flexibility are judged per route.
//   teaserStory     nostalgic flavour, never names the Boss
//   howItPlays      one line: what the route changes in your game plan
//   playStyle       tags for the spread overview
//   stages          4 x { stageNumber, evolutionCard, impact }, stage 4 =
//                   the Boss (isBoss: true). No dpCost here: 2.0 prices
//                   are configuration (boss_route_stages.dp_cost_to_reach,
//                   approved 1,800 / 3,200 / 5,500). The migration copies
//                   the live configured price, it never hardcodes one.
//   supportGrants   { stageNumber, cardName, exclusive, impact, quantity? }
//                   quantity defaults to 1 (every v3 grant is 1 copy).
//   balance         { consistency, interaction, bossImpact, floor,
//                     ceiling } 1-10, the qualitative half of the model
//   fairness        { cardName: why this pool-external card is fair }
//
// RULES (enforced by the generator, see validateRoutesV3()):
//   - every name exists verbatim in the YGOPRODeck TCG snapshot
//     (data/external/ygoprodeck-cardinfo.json) and is in Master Duel
//     (the group plays MD Unlimited rooms; not_available always blocks);
//   - no Synchro / Link / Pendulum monster, no card that needs them;
//   - no card twice in one route, no card in two routes;
//   - EXCLUSIVE <=> OUTSIDE THE CLASSIC POOL. A pool-external card is only
//     deck-legal through the Boss-route exemption, and the exemption only
//     covers evolutions + is_route_exclusive grants, so every
//     pool-external grant must be exclusive. In-pool grants stay
//     non-exclusive on purpose: other players can still pull them from
//     packs / draft / shop, and the owner can collect extra copies.
//   - nothing forbidden or legendary_unique (our proposal or the 2014
//     list) as a support grant; in-pool cards keep their normal banlist
//     limit even for the route owner (the exemption only waives limits
//     for cards that are outside the pool, e.g. Dark Magician of Chaos).
//   - no floodgates / hard locks, no free OTK or FTK enablers.
//
// IMPACT (per card, 1-10, in THIS route's context):
//   9-10 game-dominating   7-8 premium   5-6 solid core   3-4 role player
//   1-2 filler. Anchored on ranking-v2 corrected draftValue (in-pool) or
//   the valuation engine's draftValue (pool-external), then adjusted by
//   hand for route context; scripts/boss-route-balance.mjs prints both
//   so every adjustment is visible.

export const BOSS_ROUTES_V3 = [
  {
    code: "s2_blue_eyes",
    name: "Blue-Eyes White Dragon",
    displayOrder: 1,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 4, bossPower: 4, synergy: 4, flexibility: 2 },
    teaserStory: "Three white dragons, three thousand attack each, and a duelist who refused to believe in anything smaller. The legend says they were never meant to stay apart.",
    howItPlays: "Pure power: cheat 3000-ATK dragons onto the field turn after turn, then fuse them into something your opponent's monsters simply cannot fight.",
    playStyle: ["beatdown", "fusion"],
    stages: [
      { stageNumber: 1, evolutionCard: "Blue-Eyes White Dragon", impact: 5 },
      { stageNumber: 2, evolutionCard: "Blue-Eyes Alternative White Dragon", impact: 7 },
      { stageNumber: 3, evolutionCard: "Blue-Eyes Twin Burst Dragon", impact: 6 },
      { stageNumber: 4, evolutionCard: "Neo Blue-Eyes Ultimate Dragon", impact: 7, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "The White Stone of Legend", exclusive: false, impact: 4 },
      { stageNumber: 1, cardName: "Trade-In", exclusive: false, impact: 5 },
      { stageNumber: 1, cardName: "Return of the Dragon Lords", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Sage with Eyes of Blue", exclusive: true, impact: 5 },
      { stageNumber: 2, cardName: "The Melody of Awakening Dragon", exclusive: true, impact: 5 },
      { stageNumber: 2, cardName: "Maiden with Eyes of Blue", exclusive: false, impact: 5 },
      { stageNumber: 3, cardName: "Dragon's Mirror", exclusive: false, impact: 5 },
      { stageNumber: 3, cardName: "Dragon Spirit of White", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Burst Stream of Destruction", exclusive: false, impact: 6 },
      { stageNumber: 4, cardName: "Blue-Eyes Ultimate Dragon", exclusive: false, impact: 3 },
      { stageNumber: 4, cardName: "The White Stone of Ancients", exclusive: true, impact: 5 },
    ],
    balance: { consistency: 6, interaction: 6, bossImpact: 7, floor: 5, ceiling: 8 },
    fairness: {
      "Blue-Eyes Alternative White Dragon": "Special Summons itself by revealing Blue-Eyes (once per turn) and can destroy one monster per turn, but then it cannot attack. A 3000 beater OR a removal spell each turn, not both.",
      "Blue-Eyes Twin Burst Dragon": "Needs two Blue-Eyes on the field. Two attacks on monsters and battle immunity, but no protection from cards and no direct-damage boost.",
      "Neo Blue-Eyes Ultimate Dragon": "Three cards NAMED Blue-Eyes White Dragon for one 4500 body (Alternative counts on the field/GY; the route gives 2 of the 3, a third copy comes from packs - Blue-Eyes White Dragon is a pool Ultra Rare). Its extra attacks need it to be your ONLY face-up card and cost a Blue-Eyes Fusion from the Extra Deck each time; its protection is a one-time banish from the GY. Known ceiling: Burst Stream + Dragon's Mirror + Neo can win in one turn, but only with 3 Blue-Eyes and a cleared field.",
      "Sage with Eyes of Blue": "Tuner (its effects do not need Synchro): searches a Level 1 LIGHT Tuner, or trades an Effect Monster for a Blue-Eyes from the Deck once per turn.",
      "The Melody of Awakening Dragon": "Discard 1, add 2 dragons with 3000+ ATK / 2500 or less DEF. Card advantage for a deck that only plays big dragons; no summon.",
      "Dragon Spirit of White": "2500 Normal-in-hand dragon that banishes one Spell/Trap when summoned. One-for-one removal.",
      "The White Stone of Ancients": "Tuner (no Synchro needed): when sent to the GY it summons a Blue-Eyes from the Deck in the End Phase. Once per turn.",
    },
  },
  {
    code: "s2_red_eyes",
    name: "Red-Eyes Black Dragon",
    displayOrder: 2,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 3, bossPower: 4, synergy: 4, flexibility: 3 },
    teaserStory: "It was never the strongest dragon in the room, only the one with the most potential. Knock it down and it comes back angrier, and every fall leaves a scar on the other player.",
    howItPlays: "Your graveyard is your hand: Red-Eyes keep coming back from the GY, and every big dragon that hits the field or the GY burns your opponent's Life Points.",
    playStyle: ["graveyard", "burn", "revive"],
    stages: [
      { stageNumber: 1, evolutionCard: "Red-Eyes Black Dragon", impact: 5 },
      { stageNumber: 2, evolutionCard: "Red-Eyes Darkness Dragon", impact: 5 },
      { stageNumber: 3, evolutionCard: "Red-Eyes Darkness Metal Dragon", impact: 7 },
      { stageNumber: 4, evolutionCard: "Red-Eyes Flare Metal Dragon", impact: 7, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Red-Eyes Insight", exclusive: true, impact: 5 },
      { stageNumber: 1, cardName: "Red-Eyes Spirit", exclusive: true, impact: 4 },
      { stageNumber: 1, cardName: "Red-Eyes Wyvern", exclusive: false, impact: 4 },
      { stageNumber: 2, cardName: "Red-Eyes Fusion", exclusive: false, impact: 6 },
      { stageNumber: 2, cardName: "Return of the Red-Eyes", exclusive: true, impact: 5 },
      { stageNumber: 2, cardName: "Cards of the Red Stone", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Red-Eyes Black Flare Dragon", exclusive: true, impact: 4 },
      { stageNumber: 3, cardName: "Red-Eyes Retro Dragon", exclusive: true, impact: 4 },
      { stageNumber: 3, cardName: "Inferno Fire Blast", exclusive: false, impact: 4 },
      { stageNumber: 4, cardName: "Red-Eyes Burn", exclusive: true, impact: 4 },
      { stageNumber: 4, cardName: "Red-Eyes Archfiend of Lightning", exclusive: true, impact: 6 },
    ],
    balance: { consistency: 7, interaction: 7, bossImpact: 7, floor: 6, ceiling: 7 },
    fairness: {
      "Red-Eyes Flare Metal Dragon": "Rank 7 Xyz from two Level 7s. Burns 500 each time the opponent activates something (only while it has material), cannot be destroyed by effects while it has material, revives a Red-Eyes Normal Monster once per turn by detaching. It slowly runs out of material.",
      "Red-Eyes Insight": "Send a Red-Eyes from hand/Deck to the GY, add a Red-Eyes Spell/Trap. Once per turn, card-neutral, fills the GY the route wants.",
      "Red-Eyes Spirit": "Plain trap: revive one Red-Eyes. A narrower Call of the Haunted.",
      "Return of the Red-Eyes": "Continuous trap: revive a Normal Monster once per turn while you control a Red-Eyes. Removable; needs a Red-Eyes already on the field.",
      "Cards of the Red Stone": "Send a Level 7 Red-Eyes from hand: draw 2. Once per turn; the sent dragon is still useful in the GY, which is the point of the route.",
      "Red-Eyes Black Flare Dragon": "Gemini: must be Normal Summoned twice before it burns 2400 after a battle, once per turn.",
      "Red-Eyes Retro Dragon": "Level 4 that brings back destroyed Red-Eyes from your hand-trigger, or gives an extra Red-Eyes Normal Summon. Defensive value.",
      "Red-Eyes Burn": "Both players take the destroyed Red-Eyes' ATK as damage - symmetrical, so it closes games, never starts them.",
      "Red-Eyes Archfiend of Lightning": "Gemini Fiend: only after a SECOND Normal Summon (Red-Eyes Retro Dragon can give the extra one) it destroys, once per turn, the opponent's face-up monsters with DEF lower than 2500. Replaced Red-Eyes Slash Dragon, which needs Warriors the route never gives (review). Slow, telegraphed, and set monsters / high-DEF walls survive it.",
    },
  },
  {
    code: "s2_elemental_hero",
    name: "Elemental HERO",
    displayOrder: 3,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 3, bossPower: 4, synergy: 4, flexibility: 5 },
    teaserStory: "Every hero has a weakness, which is why they never come alone. Two of them step into the light together, and something new walks out.",
    howItPlays: "A toolbox: keep your heroes small, then fuse them into the exact answer the board needs - a monster-shrinker, a backrow-breaker or a burning finisher.",
    playStyle: ["fusion", "toolbox", "combo"],
    stages: [
      { stageNumber: 1, evolutionCard: "Elemental HERO Sparkman", impact: 3 },
      { stageNumber: 2, evolutionCard: "Elemental HERO Flame Wingman", impact: 4 },
      { stageNumber: 3, evolutionCard: "Elemental HERO Great Tornado", impact: 6 },
      { stageNumber: 4, evolutionCard: "Elemental HERO Shining Flare Wingman", impact: 7, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Polymerization", exclusive: false, impact: 5 },
      { stageNumber: 1, cardName: "E - Emergency Call", exclusive: false, impact: 5 },
      { stageNumber: 1, cardName: "Elemental HERO Shadow Mist", exclusive: false, impact: 6 },
      { stageNumber: 2, cardName: "Elemental HERO Avian", exclusive: false, impact: 3 },
      { stageNumber: 2, cardName: "Elemental HERO Liquid Soldier", exclusive: true, impact: 5 },
      { stageNumber: 2, cardName: "Elemental HERO Burstinatrix", exclusive: false, impact: 3 },
      { stageNumber: 3, cardName: "Mask Change", exclusive: false, impact: 5 },
      { stageNumber: 3, cardName: "Elemental HERO Sunrise", exclusive: true, impact: 6 },
      { stageNumber: 3, cardName: "Masked HERO Divine Wind", exclusive: true, impact: 5 },
      { stageNumber: 4, cardName: "Miracle Fusion", exclusive: false, impact: 6 },
      { stageNumber: 4, cardName: "Fifth Hope", exclusive: false, impact: 5 },
    ],
    balance: { consistency: 7, interaction: 7, bossImpact: 7, floor: 6, ceiling: 7 },
    fairness: {
      "Elemental HERO Liquid Soldier": "Revives a Level 4 HERO on Normal Summon, or draws 2 then discards 1 after being used as Fusion Material. One effect per turn.",
      "Elemental HERO Sunrise": "Fusion of 2 HEROes with different Attributes: searches Miracle Fusion and destroys one card when a HERO attacks (once per turn). Fair 2-for-1 Fusion that needs materials every time.",
      "Masked HERO Divine Wind": "Mask Change target (needs a WIND HERO on the field: Avian, or Flame Wingman / Great Tornado). Cannot be destroyed by battle and limits the opponent to one attack per turn; it does not stop summons, spells or traps. Note: Shadow Mist searches Mask Change, and a WATER HERO (Liquid Soldier) turns into Masked HERO Acid (pool), a one-sided Heavy Storm - strong but a 2-card pool combo anyone can build.",
    },
  },
  {
    code: "s2_ancient_gear",
    name: "Ancient Gear",
    displayOrder: 4,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 3, bossPower: 4, synergy: 4, flexibility: 2 },
    teaserStory: "In a forgotten cellar under the academy, rusted gears begin to turn again. Every machine that climbs out is bigger than the last, and none of them lets you pull a trick while it swings.",
    howItPlays: "Tribute small gears into giant ones: Ancient Gear monsters shut off your opponent's Spells and Traps whenever they attack, so you win by building one huge, piercing machine and swinging into a board that cannot answer in battle.",
    playStyle: ["beatdown", "tribute", "anti-backrow"],
    stages: [
      { stageNumber: 1, evolutionCard: "Ancient Gear Soldier", impact: 4 },
      { stageNumber: 2, evolutionCard: "Ancient Gear Engineer", impact: 5 },
      { stageNumber: 3, evolutionCard: "Ancient Gear Golem", impact: 6 },
      { stageNumber: 4, evolutionCard: "Ultimate Ancient Gear Golem", impact: 8, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Ancient Gear Wyvern", exclusive: true, impact: 6 },
      { stageNumber: 1, cardName: "Ancient Gear Box", exclusive: false, impact: 4 },
      { stageNumber: 1, cardName: "Geartown", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Ancient Gear Beast", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Ancient Gear Reborn", exclusive: true, impact: 4 },
      { stageNumber: 2, cardName: "Ancient Gear Fist", exclusive: false, impact: 4 },
      { stageNumber: 3, cardName: "Ancient Gear Frame", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Ancient Gear Hunting Hound", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Ancient Gear Workshop", exclusive: false, impact: 3 },
      { stageNumber: 4, cardName: "Ancient Gear Gadjiltron Dragon", exclusive: false, impact: 4 },
      { stageNumber: 4, cardName: "Ancient Gear Castle", exclusive: false, impact: 3 },
    ],
    balance: { consistency: 7, interaction: 6, bossImpact: 8, floor: 5, ceiling: 9 },
    fairness: {
      "Ancient Gear Wyvern": "1700 Level 4: on Normal or Special Summon it searches one other \"Ancient Gear\" card, once per turn, and you cannot Set cards for the rest of that turn. A plain searcher (it can also find the pool's Ancient Gear Fusion - see Hunting Hound); while it attacks only the opponent's monster effects are blocked, not their Spells/Traps.",
      "Ancient Gear Reborn": "Continuous trap, only one on the field: once per turn, while you control NO monsters, revive one Ancient Gear monster (+200 ATK). A comeback card that does nothing while you are ahead, and it cannot revive Ancient Gear Golem (cannot be Special Summoned) or the Fusion Boss (must be Fusion Summoned) - it brings back the small and mid gears, or Gadjiltron Dragon.",
      "Ancient Gear Frame": "1600 Level 4: discard 1 to search Ancient Gear Golem or a Spell/Trap that lists it (e.g. the pool's Ancient Gear Fusion), once per turn. If the opponent's effect removes it from the field it summons up to 3 Ancient Gear Golem from your HAND ignoring conditions - the route grants one Golem, so this is one surprise Golem unless the owner drafts more (Golem is a pool Secret Rare, max 3 copies in the whole league).",
      "Ancient Gear Hunting Hound": "1000 Level 3: burns 600 when Normal Summoned, and once per turn Fusion Summons an \"Ancient Gear\" Fusion Monster using monsters from hand or field (never the Deck or GY). The route's Fusion engine for the Boss (Golem + 2 Ancient Gear monsters). Known ceiling (review, documented, not granted): the POOL cards Ancient Gear Fusion (can use Deck materials once a Golem is on the field, and Wyvern / Frame can search it) and Chaos Ancient Gear Giant (4500, unaffected by Spells/Traps, attacks every monster) are reachable for anyone who drafts them, and pool Power Bond / Limiter Removal (max 1) can turn the Boss into 8800 piercing. Ancient Gear Statue was removed after the review: Normal Summon Statue -> Golem from the Deck -> Fusion was a 2-card turn-1 Boss.",
    },
  },
  {
    code: "s2_crystal_beast",
    name: "Crystal Beast",
    displayOrder: 5,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 3, bossPower: 4, synergy: 5, flexibility: 2 },
    teaserStory: "Seven gems were sent across the sea, and the ship never arrived. The beasts sleep inside their crystals until someone gathers all seven - and then the sky turns every colour at once.",
    howItPlays: "Your monsters never really die: a destroyed Crystal Beast turns into a gem in your Spell & Trap Zone. Collect gems to fuel a 4000-ATK thunder wall, and once seven different beasts are gathered, call a dragon that can send the whole field back to the Deck.",
    playStyle: ["recursion", "collect-them-all", "board-reset"],
    stages: [
      { stageNumber: 1, evolutionCard: "Crystal Beast Sapphire Pegasus", impact: 5 },
      { stageNumber: 2, evolutionCard: "Crystal Beast Rainbow Dragon", impact: 6 },
      { stageNumber: 3, evolutionCard: "Hamon, Lord of Striking Thunder", impact: 7 },
      { stageNumber: 4, evolutionCard: "Rainbow Dragon", impact: 8, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Crystal Beast Ruby Carbuncle", exclusive: false, impact: 4 },
      { stageNumber: 1, cardName: "Crystal Bond", exclusive: true, impact: 5 },
      { stageNumber: 1, cardName: "Rare Value", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Crystal Beast Amethyst Cat", exclusive: false, impact: 3 },
      { stageNumber: 2, cardName: "Crystal Beast Topaz Tiger", exclusive: false, impact: 3 },
      { stageNumber: 2, cardName: "Crystal Conclave", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Ancient City - Rainbow Ruins", exclusive: false, impact: 6 },
      { stageNumber: 3, cardName: "Crystal Beast Amber Mammoth", exclusive: false, impact: 3 },
      { stageNumber: 3, cardName: "Crystal Beast Cobalt Eagle", exclusive: false, impact: 3 },
      { stageNumber: 4, cardName: "Crystal Beast Emerald Tortoise", exclusive: false, impact: 3 },
      { stageNumber: 4, cardName: "Rainbow Path", exclusive: false, impact: 5 },
    ],
    balance: { consistency: 6, interaction: 7, bossImpact: 7, floor: 5, ceiling: 9 },
    fairness: {
      "Crystal Beast Rainbow Dragon": "3000 Level 8 Crystal Beast (it counts as one of the seven different names the Boss needs). Special Summons itself from hand when an attack involving a Crystal Beast is declared, once per turn. While it is a gem in the Spell & Trap Zone it can banish itself to summon one Level 4 or lower Crystal Beast from the Deck with its effects negated AND search one \"Ultimate Crystal\" monster (Rainbow Dragon). It does not have to be destroyed first: Crystal Bond or Sapphire Pegasus can place it as a gem straight from the Deck, so from Stage 4 on it is a turn-1 search for the Boss (once - it banishes itself). That is why the route gives 8 Crystal Beast names (Cobalt Eagle added after the review): the Boss stays reachable after this card is used up.",
      "Crystal Bond": "Normal spell, one per turn: add one Crystal Beast from the Deck to the hand AND place a differently-named one from the Deck as a gem - a search plus a free gem (+1 card), no summon.",
      "Crystal Conclave": "Continuous trap: once per turn, when a Crystal Beast monster of yours is destroyed, summon one Crystal Beast from the Deck (a floater, 1 per turn). It can send itself to the GY to return one of your Crystal Beasts AND one card on the field to the hand - a one-time bounce that costs the trap. Known ceiling (review, documented): the POOL card Crystal Abundance (send 4 gems, every card on the field to the GY, then revive Crystal Beasts) can clear the board and, with 7 names in the GY, let the Boss attack the same turn - the classic Crystal Beast finisher, which needs a visible 4-gem setup.",
    },
  },
  {
    code: "s2_chaos_bls",
    name: "Chaos Soldier",
    displayOrder: 6,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 4, growth: 3, bossPower: 5, synergy: 4, flexibility: 3 },
    teaserStory: "Light and darkness, held in perfect balance by a warrior who was born from a ritual. Feed the graveyard one of each, and the balance tips - always in his favour.",
    howItPlays: "Keep one LIGHT and one DARK monster in your graveyard at all times: they power the ritual soldiers and the Boss, who banish whatever stands in the way.",
    playStyle: ["ritual", "banish"],
    stages: [
      { stageNumber: 1, evolutionCard: "Black Luster Soldier", impact: 4 },
      { stageNumber: 2, evolutionCard: "Black Luster Soldier - Super Soldier", impact: 6 },
      { stageNumber: 3, evolutionCard: "Chaos Sorcerer", impact: 6 },
      { stageNumber: 4, evolutionCard: "Black Luster Soldier - Envoy of the Beginning", impact: 9, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Super Soldier Synthesis", exclusive: true, impact: 6 },
      { stageNumber: 1, cardName: "Gateway to Chaos", exclusive: true, impact: 5 },
      { stageNumber: 1, cardName: "D.D. Warrior Lady", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Envoy of Chaos", exclusive: true, impact: 4 },
      { stageNumber: 2, cardName: "Chaos Valkyria", exclusive: true, impact: 5 },
      { stageNumber: 2, cardName: "Sonic Bird", exclusive: false, impact: 4 },
      { stageNumber: 3, cardName: "Super Soldier Rebirth", exclusive: true, impact: 4 },
      { stageNumber: 3, cardName: "Chaos Seed", exclusive: false, impact: 3 },
      { stageNumber: 3, cardName: "Gaia The Fierce Knight", exclusive: false, impact: 3 },
      { stageNumber: 4, cardName: "Super Soldier Shield", exclusive: true, impact: 5 },
      { stageNumber: 4, cardName: "Black Luster Ritual", exclusive: false, impact: 3 },
    ],
    balance: { consistency: 6, interaction: 8, bossImpact: 9, floor: 5, ceiling: 8 },
    fairness: {
      "Black Luster Soldier - Super Soldier": "Ritual 3000 that burns the ATK of what it destroys by battle and, when destroyed, calls a Gaia The Fierce Knight. Once per turn summon limit on its own name.",
      "Super Soldier Synthesis": "Ritual Spell: send 1 LIGHT + 1 DARK (one from hand, one from Deck) with Levels totalling 8 to Ritual Summon a Black Luster Soldier from hand or GY. Once per turn; it is the route's engine, and it still costs a card.",
      "Gateway to Chaos": "Field Spell: searches one Black Luster Soldier Ritual Monster or Gaia when activated, and every 3 Spell Counters (monsters sent from hand/field to the GY) search a Ritual Spell, once per turn. Narrow on purpose: it only finds this route's own cards (it replaced Chaos Space, which could search any LIGHT/DARK Chaos monster - see the review). Its counters also feed Super Soldier Shield's reset.",
      "Envoy of Chaos": "Hand trap for battle only (+1500 to a BLS/Gaia and resets the opponent's ATK during that battle). Returns itself by banishing LIGHT+DARK.",
      "Chaos Valkyria": "1800 Level 4 that summons itself by banishing a LIGHT/DARK from the GY, and dumps one when banished. Once per turn each; balanced by the name-lock on its dump.",
      "Super Soldier Rebirth": "Swap a BLS on the field for a different BLS from hand ignoring conditions, or later recycle a BLS from the GY. Once per turn.",
      "Super Soldier Shield": "Counter trap that only stops TARGETING effects while you control a Black Luster Soldier. Its reset needs a Spell Counter, which this route does not make, so in practice it is one use.",
    },
  },
  {
    code: "s2_six_samurai",
    name: "Six Samurai",
    displayOrder: 7,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 3, bossPower: 4, synergy: 5, flexibility: 3 },
    teaserStory: "Six warriors swore an oath under one banner. Alone each one is just a sword, but they guard each other's backs - and the clan's oldest secret only wakes when three different clans stand side by side.",
    howItPlays: "Swarm the field with samurai that summon each other for free and take hits for one another, then take the opponent apart one card per turn: they pop Spells and Traps, destroy monsters, and finally banish whatever is left.",
    playStyle: ["swarm", "removal", "protection"],
    stages: [
      { stageNumber: 1, evolutionCard: "The Six Samurai - Zanji", impact: 5 },
      { stageNumber: 2, evolutionCard: "Grandmaster of the Six Samurai", impact: 5 },
      { stageNumber: 3, evolutionCard: "Enishi, Shien's Chancellor", impact: 6 },
      { stageNumber: 4, evolutionCard: "Secret Six Samurai - Rihan", impact: 8, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Shien's Smoke Signal", exclusive: false, impact: 5 },
      { stageNumber: 1, cardName: "Legendary Six Samurai - Kizan", exclusive: false, impact: 5 },
      { stageNumber: 1, cardName: "The Six Samurai - Yaichi", exclusive: false, impact: 4 },
      { stageNumber: 2, cardName: "Six Samurai United", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Secret Six Samurai - Kizaru", exclusive: true, impact: 5 },
      { stageNumber: 2, cardName: "The Six Samurai - Kamon", exclusive: false, impact: 4 },
      { stageNumber: 3, cardName: "Musakani Magatama", exclusive: false, impact: 5 },
      { stageNumber: 3, cardName: "Six Strike - Double Assault", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Shien's Squire", exclusive: false, impact: 3 },
      { stageNumber: 4, cardName: "Secret Skills of the Six Samurai", exclusive: true, impact: 4 },
      { stageNumber: 4, cardName: "The Six Samurai - Irou", exclusive: false, impact: 4 },
    ],
    balance: { consistency: 7, interaction: 9, bossImpact: 7, floor: 6, ceiling: 8 },
    fairness: {
      "Secret Six Samurai - Rihan": "2400 Fusion of 3 Six Samurai monsters with DIFFERENT Attributes, made by sending them from your field to the GY (no Polymerization). Once per turn it banishes one card on the field, but each time you must also banish a Six Samurai card from your hand or field - removal that eats your own board. It can protect a Six Samurai once by banishing itself from the GY. A small body: it wins by removal, not by damage. The route gives five Attributes (Zanji LIGHT, Yaichi WATER, Kamon FIRE, Irou DARK, Kizan / Grandmaster / Kizaru EARTH); WIND only comes from pool Kageki / Nisashi. Review: Rihan may banish ITSELF as the cost, and Secret Skills can bring a banished Rihan back (it was properly summoned first), so a good turn is 2 banishes - rated interaction 9, the strongest of the three new routes.",
      "Secret Six Samurai - Kizaru": "1900 Level 4: when Special Summoned it searches one Six Samurai monster whose Attribute differs from every monster you control (a fixing tool for the Boss), and it can protect one Six Samurai once from the GY. It needs a Special Summon (Six Strike - Double Assault, Return of the Six Samurai, Shien's Dojo) - it cannot summon itself.",
      "Six Strike - Double Assault": "Quick-Play, one per turn across all its effects: summon one Six Samurai with 2000 or less ATK from hand/GY and/or flip one opponent's monster with 2000 or less ATK face-down (both only with 2+ Six Samurai). Later it can banish itself from the GY to add a Six Samurai from the GY. An extender, never a removal of big monsters.",
      "Secret Skills of the Six Samurai": "Quick-Play, one per turn: send one of your monsters to the GY to bring back one BANISHED Six Samurai. Card-neutral at best; it recycles what Rihan and Enishi, Shien's Chancellor banish as their cost.",
    },
  },
  {
    code: "s2_gladiator_beast",
    name: "Gladiator Beasts",
    displayOrder: 8,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 4, bossPower: 4, synergy: 5, flexibility: 3 },
    teaserStory: "In the arena nobody fights twice in a row. When the trumpet sounds, the beast who just fought walks out of the gate and a fresh one walks in, angrier than the last.",
    howItPlays: "Attack every turn, then tag your Gladiator Beast out for a fresh one from the Deck with a new effect - and shuffle three of them together into the Boss who stops spells and traps.",
    playStyle: ["tempo", "tag-out", "contact-fusion"],
    stages: [
      { stageNumber: 1, evolutionCard: "Gladiator Beast Laquari", impact: 5 },
      { stageNumber: 2, evolutionCard: "Gladiator Beast Darius", impact: 6 },
      { stageNumber: 3, evolutionCard: "Gladiator Beast Gyzarus", impact: 6 },
      { stageNumber: 4, evolutionCard: "Gladiator Beast Heraklinos", impact: 8, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Gladiator Proving Ground", exclusive: false, impact: 5 },
      { stageNumber: 1, cardName: "Test Tiger", exclusive: false, impact: 4 },
      { stageNumber: 1, cardName: "Gladiator Beast Equeste", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Gladiator Beast Murmillo", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Gladiator Beast War Chariot", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Gladiator Beast Noxious", exclusive: true, impact: 4 },
      { stageNumber: 3, cardName: "Gladiator Beast Bestiari", exclusive: false, impact: 5 },
      { stageNumber: 3, cardName: "Gladiator Beast's Respite", exclusive: false, impact: 5 },
      { stageNumber: 3, cardName: "Gladiator Beast Sagittarii", exclusive: true, impact: 5 },
      { stageNumber: 4, cardName: "Gladiator Beast United", exclusive: true, impact: 5 },
      { stageNumber: 4, cardName: "Gladiator Beast Hoplomus", exclusive: false, impact: 3 },
    ],
    balance: { consistency: 7, interaction: 7, bossImpact: 7, floor: 6, ceiling: 7 },
    fairness: {
      "Gladiator Beast Noxious": "0-ATK Level 5 that stops one direct attack from the hand and dumps a Gladiator Beast to the GY when tagged in. Defensive utility.",
      "Gladiator Beast Sagittarii": "Tagged in: discard a Gladiator Beast card to draw 2. Card advantage that only works through a tag-out.",
      "Gladiator Beast United": "Quick-Play, Battle Phase only: contact-fuse a Gladiator Beast Fusion from hand/field/GY materials. Once per turn, and only Gladiator Beasts may attack that turn. It makes the Boss reachable without making it free.",
    },
  },
  {
    code: "s2_zombie",
    name: "Zombie Horde",
    displayOrder: 9,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 3, bossPower: 4, synergy: 4, flexibility: 3 },
    teaserStory: "You can destroy them. You can send them to the grave. It only makes them closer to home. The horde does not count its losses - it counts how many get back up.",
    howItPlays: "Trade monsters freely, because the graveyard is a second hand: Zombies revive each other every turn, and the Boss turns every Zombie effect into a banish.",
    playStyle: ["graveyard", "swarm"],
    stages: [
      { stageNumber: 1, evolutionCard: "Zombie Master", impact: 5 },
      { stageNumber: 2, evolutionCard: "Il Blud", impact: 6 },
      { stageNumber: 3, evolutionCard: "Despair from the Dark", impact: 4 },
      { stageNumber: 4, evolutionCard: "Doomking Balerdroch", impact: 8, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Book of Life", exclusive: false, impact: 5 },
      { stageNumber: 1, cardName: "Goblin Zombie", exclusive: false, impact: 5 },
      { stageNumber: 1, cardName: "Pyramid Turtle", exclusive: false, impact: 4 },
      { stageNumber: 2, cardName: "Mezuki", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Mystic Plasma Zone", exclusive: false, impact: 3 },
      { stageNumber: 2, cardName: "Gozuki", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Shutendoji", exclusive: false, impact: 6 },
      { stageNumber: 3, cardName: "Zombie Necronize", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Red-Eyes Zombie Dragon", exclusive: false, impact: 4 },
      { stageNumber: 4, cardName: "Zombie Power Struggle", exclusive: true, impact: 4 },
      { stageNumber: 4, cardName: "Vampire Lord", exclusive: false, impact: 4 },
    ],
    balance: { consistency: 7, interaction: 7, bossImpact: 7, floor: 6, ceiling: 7 },
    fairness: {
      "Doomking Balerdroch": "2800 Zombie. Each time another Zombie activates an effect it can negate that effect or banish one monster from the field/GY - each option once per turn. Under Zombie World (a pool card, NOT granted by the route since the review) every monster is a Zombie, so it would also trigger on the opponent's effects; that combo needs the owner to draft Zombie World. Revives itself in Defense in the Standby Phase while any Field Spell is face-up (the route grants Mystic Plasma Zone for that). Strong and recurring, never more than one banish + one negate per turn.",
      "Gozuki": "Mills one Zombie per turn and, when sent to the GY, swaps a GY Zombie for a summon from hand. Once per turn each.",
      "Zombie Necronize": "Steal one monster until the End Phase while you have a Level 5+ Zombie. Can reset from the GY by shuffling a banished Zombie back - once per turn across both effects, so one steal per turn at most.",
      "Zombie Power Struggle": "Quick-Play +/-1000 ATK on a Zombie, resets from the GY. A combat trick, once per turn.",
    },
  },
  {
    code: "s2_harpie",
    name: "Harpie Ladies",
    displayOrder: 10,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 4, bossPower: 3, synergy: 5, flexibility: 3 },
    teaserStory: "Three sisters, one pet dragon and a hunting ground where no trap is safe. They are graceful, they are fast, and they never, ever come alone.",
    howItPlays: "Flood the field with Harpie Ladies: each one that lands on the hunting ground pops a Spell or Trap, and a full flock blows up monsters and swoops in for direct hits.",
    playStyle: ["swarm", "backrow-removal"],
    stages: [
      { stageNumber: 1, evolutionCard: "Harpie Channeler", impact: 5 },
      { stageNumber: 2, evolutionCard: "Harpie Lady Sisters", impact: 4 },
      { stageNumber: 3, evolutionCard: "Harpie's Pet Dragon", impact: 4 },
      { stageNumber: 4, evolutionCard: "Harpie's Pet Phantasmal Dragon", impact: 6, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Harpies' Hunting Ground", exclusive: false, impact: 6 },
      { stageNumber: 1, cardName: "Elegant Egotist", exclusive: false, impact: 4 },
      { stageNumber: 1, cardName: "Harpie Queen", exclusive: false, impact: 4 },
      { stageNumber: 2, cardName: "Hysteric Sign", exclusive: false, impact: 6 },
      { stageNumber: 2, cardName: "Harpie Perfumer", exclusive: true, impact: 5 },
      { stageNumber: 2, cardName: "Harpie Lady Elegance", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Harpie Lady Phoenix Formation", exclusive: false, impact: 6 },
      { stageNumber: 3, cardName: "Harpie's Pet Baby Dragon", exclusive: false, impact: 6 },
      { stageNumber: 3, cardName: "Harpie's Feather Storm", exclusive: true, impact: 5 },
      { stageNumber: 4, cardName: "Harpie Harpist", exclusive: true, impact: 6 },
      { stageNumber: 4, cardName: "Hysteric Party", exclusive: false, impact: 5 },
    ],
    balance: { consistency: 7, interaction: 8, bossImpact: 6, floor: 6, ceiling: 7 },
    fairness: {
      "Harpie Perfumer": "Name becomes Harpie Lady; on summon searches one Spell/Trap that lists Harpie Lady Sisters (two if you control a Level 5+ Harpie). Once per turn.",
      "Harpie Lady Elegance": "Shuffle Harpie Lady Sisters back to summon 3 differently-named Harpies (hand, Deck, GY), then WIND-only for the turn. Once per turn; it costs your Level 6.",
      "Harpie's Feather Storm": "Trap: for one turn, negate monster effects your opponent activates, if you control a WIND Winged Beast. Its GY effect can only fetch Harpie's Feather Duster if you own one (a Legendary - 1 per league).",
      "Harpie Harpist": "Name becomes Harpie Lady. On Normal Summon it returns one of your Winged Beasts AND one face-up opponent's monster to the hand (a bounce that costs you tempo too); when sent to the GY it searches a Level 4 Winged Beast with 1500 or less ATK. Once per turn each. Added after the review: the route had no answer to monsters outside Phoenix Formation.",
    },
  },
  {
    code: "s2_toon",
    name: "Toon World",
    displayOrder: 11,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 4, growth: 3, bossPower: 4, synergy: 5, flexibility: 2 },
    teaserStory: "Inside the book, nobody gets hurt. The toons laugh, stretch and step right past your monsters - and by the time you figure out the rules, the last page has already been turned.",
    howItPlays: "Open the book first: with Toon World on the field your Toons attack your opponent directly over their monsters, while the Kingdom keeps them safe from removal.",
    playStyle: ["direct-attack", "protection", "stall-light"],
    stages: [
      { stageNumber: 1, evolutionCard: "Toon Masked Sorcerer", impact: 5 },
      { stageNumber: 2, evolutionCard: "Toon Summoned Skull", impact: 4 },
      { stageNumber: 3, evolutionCard: "Toon Dark Magician", impact: 7 },
      { stageNumber: 4, evolutionCard: "Toon Black Luster Soldier", impact: 8, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Toon World", exclusive: false, impact: 4 },
      { stageNumber: 1, cardName: "Toon Table of Contents", exclusive: false, impact: 5 },
      { stageNumber: 1, cardName: "Toon Kingdom", exclusive: false, impact: 7 },
      { stageNumber: 2, cardName: "Toon Bookmark", exclusive: true, impact: 5 },
      { stageNumber: 2, cardName: "Toon Harpie Lady", exclusive: true, impact: 5 },
      { stageNumber: 2, cardName: "Toon Defense", exclusive: false, impact: 3 },
      { stageNumber: 3, cardName: "Toon Page-Flip", exclusive: true, impact: 4 },
      { stageNumber: 3, cardName: "Shadow Toon", exclusive: true, impact: 4 },
      { stageNumber: 3, cardName: "Toon Goblin Attack Force", exclusive: false, impact: 4 },
      { stageNumber: 4, cardName: "Toon Gemini Elf", exclusive: false, impact: 3 },
      { stageNumber: 4, cardName: "Toon Mermaid", exclusive: false, impact: 4 },
    ],
    balance: { consistency: 6, interaction: 7, bossImpact: 8, floor: 5, ceiling: 8 },
    fairness: {
      "Toon Black Luster Soldier": "Needs Toons with 8+ Levels tributed from hand/field (or Toon Dark Magician can bring it from the Deck). Unlike most Toons it CAN attack the turn it is summoned. 3000 direct attacker that can banish one card per turn instead of attacking - removes OR hits, not both. Behind Toon Kingdom it is hard to target, so the review swapped Toon Terror (a counter trap on top) for Toon Gemini Elf: Bottomless Trap Hole, battle and removing the Kingdom are the answers.",
      "Toon Dark Magician": "Once per turn: discard a Toon card to summon another Toon from the Deck or search a Toon Spell/Trap. The engine of the route; it costs a card each time.",
      "Toon Bookmark": "Searches Toon World (or a card that lists it) and can save Toon World once from destruction. Once per turn.",
      "Toon Harpie Lady": "Summons itself from hand with Toon World and pops one Spell/Trap if you have another Toon. Once per turn; 1300 ATK.",
      "Toon Page-Flip": "With Toon World: reveal 3 different Toons, the opponent picks which one you summon. Random by design.",
      "Shadow Toon": "Burn equal to one of the opponent's monsters' ATK, only with Toon World, once per turn. It turns their biggest monster into damage instead of removing it.",
    },
  },
  {
    code: "s2_galaxy_eyes",
    name: "Galaxy-Eyes Photon",
    displayOrder: 12,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 3, bossPower: 4, synergy: 4, flexibility: 3 },
    teaserStory: "A dragon made of starlight, hunting through the dark between the galaxies. When two of them meet, they become a number - and numbers do not lose.",
    howItPlays: "Make Level 8s fast with Photon and Galaxy monsters, stack two of them into a Rank 8 Xyz, and let the Boss shut off every other effect on the field before it attacks twice.",
    playStyle: ["xyz", "midrange"],
    stages: [
      { stageNumber: 1, evolutionCard: "Photon Thrasher", impact: 4 },
      { stageNumber: 2, evolutionCard: "Galaxy-Eyes Photon Dragon", impact: 5 },
      { stageNumber: 3, evolutionCard: "Number 62: Galaxy-Eyes Prime Photon Dragon", impact: 5 },
      { stageNumber: 4, evolutionCard: "Number 107: Galaxy-Eyes Tachyon Dragon", impact: 8, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Galaxy Soldier", exclusive: true, impact: 6 },
      { stageNumber: 1, cardName: "Photon Vanisher", exclusive: true, impact: 5 },
      { stageNumber: 1, cardName: "Photon Lead", exclusive: false, impact: 4 },
      { stageNumber: 2, cardName: "Galaxy Expedition", exclusive: false, impact: 4 },
      { stageNumber: 2, cardName: "Galaxy Wizard", exclusive: false, impact: 4 },
      { stageNumber: 2, cardName: "Photon Orbital", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Photon Stream of Destruction", exclusive: true, impact: 6 },
      { stageNumber: 3, cardName: "Galaxy Knight", exclusive: false, impact: 4 },
      { stageNumber: 3, cardName: "Xyz Reborn", exclusive: false, impact: 4 },
      { stageNumber: 4, cardName: "Galaxy-Eyes Cipher Dragon", exclusive: true, impact: 6 },
      { stageNumber: 4, cardName: "Galaxy Dragon", exclusive: false, impact: 3 },
    ],
    balance: { consistency: 7, interaction: 7, bossImpact: 8, floor: 5, ceiling: 7 },
    fairness: {
      "Galaxy Soldier": "Level 5 that summons itself by sending a LIGHT from hand and searches one Galaxy monster. Once per turn; a discard cost for a search.",
      "Photon Vanisher": "Summons itself while you control a Photon/Galaxy (once per turn) and searches Galaxy-Eyes Photon Dragon. Cannot attack that turn.",
      "Photon Orbital": "Equip: +500 and battle immunity, or trade itself for a Photon/Galaxy search. Once per turn.",
      "Photon Stream of Destruction": "Banish one card while you control a Galaxy-Eyes, only on your own turn unless you control Galaxy-Eyes Photon Dragon itself. Single 1-for-1 removal.",
      "Galaxy-Eyes Cipher Dragon": "Rank 8: borrow one opponent's monster until the End Phase (its effects negated, ATK 3000), and only Cipher may attack directly that turn. One steal per material.",
    },
  },
  {
    code: "s2_atlantean_ocean",
    name: "Legendary Ocean",
    displayOrder: 13,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 3, bossPower: 4, synergy: 4, flexibility: 3 },
    teaserStory: "An old fisherman knows the sea better than anyone. He knows where the serpents sleep, which tide pulls ships under, and that one day the ocean itself will rise and wash the whole board clean.",
    howItPlays: "Play around the Umi field spell: your sea serpents get stronger, your Atlanteans pop cards whenever they are used as a cost, and the Boss can sacrifice the ocean to wipe the field.",
    playStyle: ["control", "field-spell", "board-wipe"],
    stages: [
      { stageNumber: 1, evolutionCard: "The Legendary Fisherman", impact: 4 },
      { stageNumber: 2, evolutionCard: "The Legendary Fisherman II", impact: 5 },
      { stageNumber: 3, evolutionCard: "Poseidra, the Atlantean Dragon", impact: 6 },
      { stageNumber: 4, evolutionCard: "Levia-Dragon - Daedalus", impact: 8, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Umi", exclusive: false, impact: 4 },
      { stageNumber: 1, cardName: "Atlantean Heavy Infantry", exclusive: false, impact: 6 },
      { stageNumber: 1, cardName: "Codarus", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Atlantean Marksman", exclusive: false, impact: 6 },
      { stageNumber: 2, cardName: "A Legendary Ocean", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Big Wave Small Wave", exclusive: false, impact: 5 },
      { stageNumber: 3, cardName: "Sea Stealth Attack", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Mother Grizzly", exclusive: false, impact: 4 },
      { stageNumber: 3, cardName: "Atlantean Attack Squad", exclusive: false, impact: 4 },
      { stageNumber: 4, cardName: "Citadel Whale", exclusive: true, impact: 5 },
      { stageNumber: 4, cardName: "Salvage", exclusive: false, impact: 4 },
    ],
    balance: { consistency: 6, interaction: 8, bossImpact: 8, floor: 5, ceiling: 8 },
    fairness: {
      "The Legendary Fisherman II": "2200 Level 5 named The Legendary Fisherman; with Umi it ignores other monsters' effects. If it is destroyed it searches a Level 7 WATER. No removal of its own.",
      "Sea Stealth Attack": "Continuous trap that activates Umi; with Umi it destroys an opponent's monster that battles your Level 5+ WATER (start of Damage Step) and can protect your face-up Spells/Traps for a turn by banishing a WATER monster until the End Phase.",
      "Citadel Whale": "Summons itself by tributing 2 WATER monsters (once per turn), Sets Sea Stealth Attack from the Deck (only if you own a second one), and negates one effect that targets a single WATER monster per turn.",
    },
  },
  {
    code: "s2_volcanic",
    name: "Volcanic Inferno",
    displayOrder: 14,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 4, growth: 3, bossPower: 4, synergy: 4, flexibility: 2 },
    teaserStory: "Deep under the mountain the fire never sleeps. Small sparks become cannons, cannons become eruptions, and every monster that stands near the crater pays the price in Life Points.",
    howItPlays: "Win without attacking: feed small Volcanics to the Blaze Accelerators to destroy monsters and burn Life Points, then let the Boss melt the whole opposing field.",
    playStyle: ["burn", "removal"],
    stages: [
      { stageNumber: 1, evolutionCard: "Volcanic Rocket", impact: 5 },
      { stageNumber: 2, evolutionCard: "Volcanic Hammerer", impact: 4 },
      { stageNumber: 3, evolutionCard: "Volcanic Emperor", impact: 6 },
      { stageNumber: 4, evolutionCard: "Volcanic Doomfire", impact: 8, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "Blaze Accelerator", exclusive: false, impact: 6 },
      { stageNumber: 1, cardName: "Volcanic Shell", exclusive: false, impact: 4 },
      { stageNumber: 1, cardName: "Volcanic Scattershot", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Tri-Blaze Accelerator", exclusive: false, impact: 6 },
      { stageNumber: 2, cardName: "Volcanic Trooper", exclusive: true, impact: 5 },
      { stageNumber: 2, cardName: "Volcanic Counter", exclusive: false, impact: 4 },
      { stageNumber: 3, cardName: "Volcanic Blaze Accelerator", exclusive: true, impact: 5 },
      { stageNumber: 3, cardName: "Volcanic Rimfire", exclusive: true, impact: 4 },
      { stageNumber: 3, cardName: "Volcanic Slicer", exclusive: false, impact: 3 },
      { stageNumber: 4, cardName: "Volcanic Emission", exclusive: true, impact: 5 },
      { stageNumber: 4, cardName: "Volcanic Blaster", exclusive: false, impact: 3 },
    ],
    balance: { consistency: 7, interaction: 7, bossImpact: 8, floor: 6, ceiling: 7 },
    fairness: {
      "Volcanic Emperor": "3100 Level 8 summoned from hand/GY by banishing 3 Pyros or 1 Blaze Accelerator card (once per turn). Burns 500 per banished Pyro on summon (max 1500), Sets a Volcanic trap, and burns 500 each time the opponent Special Summons. Punishes swarming, but it is one monster with no protection.",
      "Volcanic Trooper": "Searches a Volcanic card on summon; can discard to give the opponent a Bomb Token that burns its controller 500 when destroyed. Once per turn each.",
      "Volcanic Blaze Accelerator": "Continuous spell that replaces a Blaze Accelerator: one extra Volcanic summon from hand per turn, and one monster destruction per turn by sending a Level 1 Pyro from the Deck. One card's worth of removal per turn.",
      "Volcanic Rimfire": "Level 1: when sent to the GY it dumps another Volcanic or replaces a Blaze Accelerator. Fodder that keeps the engine going, once per turn each.",
      "Volcanic Emission": "Trap: take a Volcanic from the Deck (to hand, or summon it until the End Phase), OR burn equal to a Pyro's original ATK - halved if it is your own monster. Each option once per turn.",
    },
  },
];
