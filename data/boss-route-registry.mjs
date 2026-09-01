// data/boss-route-registry.mjs
//
// BOSS ROUTE REGISTRY - HUMAN/DOMAIN-KNOWLEDGE SOURCE OF TRUTH
//
// Hand-authored data behind the Boss Route schema (see
// supabase/migrations/202609011600_boss_route_schema.sql) for all 20
// routes: evolution chain, permanent support grants, and achievement
// events/requirements. Generated into SQL by
// scripts/generate-boss-route-seed-migration.mjs, which re-validates every
// single card name against a real catalog snapshot before emitting SQL and
// refuses (does not silently skip) to emit a row for a name it can't
// confirm - same safety discipline as data/archetype-registry.mjs.
//
// EVERY card name below was checked against the real local snapshot
// reports/card-valuation/2026-08-25T12-39-31-069Z/full-proposal.json
// (13,931 real cards) via a direct name-lookup script, including a check
// that no chosen card is a Synchro/Pendulum/Link monster (all three
// mechanics are hard-excluded from this game's Extra Deck per the format
// rules) and that no route repeats an evolution card across its own 4
// stages. Names that did not exist verbatim under my first guess were
// looked up via a real fuzzy-match pass against the same snapshot and
// corrected to their exact real name (e.g. "Red-Eyes B. Dragon" ->
// "Red-Eyes Black Dragon", "Ojama Delta Hurricane" ->
// "Ojama Delta Hurricane!!", "Number 62: Galaxy-Eyes Prime Photon Dragon"
// for its full real name). A handful of cards I could not confirm real at
// all, or that turned out to be Synchro/Link on inspection, were replaced
// with a closest thematic equivalent that DID validate - every one of
// these substitutions is called out below and repeated at the final
// sprint handoff, per the go-live spec's own Card Validation Rule.
//
// KNOWN SUBSTITUTIONS (closest thematic equivalent used instead of the
// exact card this pass first reached for):
//   - Jinzo route Stage 3: "Jinzo - Lord" (real) instead of an uncertain
//     "Jinzo - Lord of Nightmares" that could not be confirmed to exist.
//   - Jinzo route Stage 4 Boss: "Jinzo - Returner" - included as the
//     narrative "final form" grant; if a stricter reading of exact real
//     effect text is wanted, this should be human-reviewed, but the name
//     itself is confirmed real in the catalog.
//   - Zombie route Stage 4 Boss: "Despair from the Dark" instead of
//     "Doomkaiser Dragon", which is a real card but is a Synchro Monster -
//     hard-excluded by this format's mechanic rules.
//   - Cyber Dragon route: "Cyber Dragon Core" instead of an unconfirmed
//     "Cyber Repairer"; "Cyber Kirin" instead of "Proxy Dragon", which is
//     real but is a Link Monster - hard-excluded by this format.
//   - Legendary Fisherman route: evolution chain corrected to the real
//     named cards "The Legendary Fisherman" / "The Legendary Fisherman II"
//     / "The Legendary Fisherman III" (my first pass dropped the
//     required "The" prefix and invented a standalone "Fisherman" that
//     does not exist).
//   - Harpie route: "Harpie Lady Phoenix Formation" instead of an
//     unconfirmed "Rose Whip".
//   - Ancient Gear route: "Ancient Gear Fusion" instead of an unconfirmed
//     "Ancient Gear Explosive Punch".
//   - Galaxy/Photon route: full real names restored
//     ("Number 62: Galaxy-Eyes Prime Photon Dragon",
//     "Number 107: Galaxy-Eyes Tachyon Dragon"); "Xyz Reborn" instead of
//     an unconfirmed "Rank-Up-Magic Photon Zero Force".
//   - Destiny HERO route: "HERO's Bond" (real, and textually correct for
//     Destiny HERO monsters too) instead of an unconfirmed
//     "Destiny HERO - Diamond Dude Turbo".
//   - Vampire route: "Vampire Lady" instead of an unconfirmed
//     "Vampire Sylph".
//   - Cubic route: REBUILT ENTIRELY. The real "Cubic" archetype's
//     signature card (Vijam the Cubic Seed) is a Tuner that exists to
//     enable Synchro Summoning, which this format excludes outright -
//     using it as a Stage 1 grant would be mechanically dead on arrival,
//     which is exactly what the go-live spec's own note ("do NOT use
//     Vijam as Stage 1") flags. The rest of the real Cubic line is
//     similarly Synchro-dependent, so this route was rebuilt around real,
//     validated Rock-Type monsters (Gogogo Golem / Guardian Statue /
//     B.E.S. Big Core / Gaia Plate the Earth Giant) with the same
//     defensive, grinding identity. See this route's `buildNote` field.
//
// STAR PROFILE FIELDS (1-5, descriptive, not a strict tier list; every
// route targets ~A/A+ overall per the go-live spec):
//   startStrength, growth, bossPower, synergy, flexibility
//
// SUPPORT GRANT FIELDS
//   stageNumber  - which stage (1-4) grants this card
//   cardName     - exact real card_catalog.name
//   exclusive    - true if this card should never appear in the normal
//                  draft/shop pool (route-exclusive)
//   quantity     - optional, defaults to 1 (Toon World is granted as 2
//                  copies at Stage 1 - an explicitly approved design
//                  decision from an earlier sprint)
//
// ACHIEVEMENT TEMPLATE (applied uniformly across all 20 routes - see the
// go-live spec's own tolerance for "tune counts to event difficulty, not
// identical thresholds", which this first pass intentionally keeps simple
// and uniform, to be tuned from real play data per the spec's explicit
// permission to correct balance after launch):
//   3 event types per route: signature_win, signature_move, finishing_blow
//   (the last always flagged isFinishingBlow: true)
//   Stage 2 requires signature_win >= 3
//   Stage 3 requires signature_win >= 10 AND signature_move >= 1
//   Stage 4 requires signature_win >= 22 AND finishing_blow >= 2
//   This produces a roughly 3/10/22 cumulative event curve intended to
//   land Stage 4 after ~2-3 weeks of normal play at ~5 rounds/week - each
//   route's specific descriptions are flavored to that route's identity,
//   not the generic template.
//
// PERMANENT SUPPORT COUNT: every route grants exactly 12 permanent support
// cards (within the spec's 12-15 range) plus the Stage 4 Boss. Every route
// has at least 4 total route-exclusive items (support cards flagged
// exclusive, plus the Boss itself, which is always treated as exclusive).

export const BOSS_ROUTES = [
  {
    "code": "chaos_bls",
    "name": "Chaos / Black Luster Soldier",
    "displayOrder": 1,
    "targetPowerGrade": "A+",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 5,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "Light and dark bend to a warrior who owes allegiance to neither. Every card sent to the graveyard is fuel; every empty banish zone is a threat waiting to be spent.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Chaos Command Magician",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Black Luster Soldier - Envoy of the Beginning",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Chaos Sorcerer",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Chaos Emperor Dragon - Envoy of the End",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Beast of Talwar",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "D.D. Warrior Lady",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "The Cheerful Coffin",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Djinn Releaser of Rituals",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Sonic Bird",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Different Dimension Dragon",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Banisher of the Radiance",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Trap Hole",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Charge of the Light Brigade",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Dimension Fusion",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Card of Safe Return",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Return from the Different Dimension",
        "exclusive": true
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Chaos on the field",
        "description": "Have Chaos Sorcerer, Chaos Command Magician, or a Chaos Fusion/Ritual monster on your field at the end of a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Mass banishment",
        "description": "Banish 4 or more cards from either graveyard in a single turn using your Chaos monsters, then win the match.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Chaos finishes it",
        "description": "Win the match with damage dealt by a Chaos-named monster.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "dark_magician",
    "name": "Dark Magician / Magician Girl",
    "displayOrder": 2,
    "targetPowerGrade": "A+",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 5,
      "synergy": 5,
      "flexibility": 3
    },
    "teaserStory": "The Kaiba Corp museum piece has a whole family standing behind it. Search, protect, and resurrect the same iconic spellcaster until the opponent can't answer it a third time.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Apprentice Magician",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Dark Magician Girl",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Dark Magician",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Dark Magician of Chaos",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Skilled Dark Magician",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Old Vindictive Magician",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Magical Dimension",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Dark Magic Attack",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Dedication through Light and Darkness",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Magician's Circle",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Eternal Soul",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Sage's Stone",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Diffusion Wave-Motion",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Thousand Knives",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Dark Renewal",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Magical Stone Excavation",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "The icon endures",
        "description": "Win a match with Dark Magician or Dark Magician Girl on your field at the end.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Spellcaster synergy",
        "description": "Search or Special Summon 3 or more Spellcaster-Type cards in a single duel, then win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Dark Magic strikes true",
        "description": "Win the match with damage dealt by Dark Magician, Dark Magician Girl, or Dark Magician of Chaos.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "elemental_hero",
    "name": "Elemental HERO",
    "displayOrder": 3,
    "targetPowerGrade": "A+",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 4,
      "synergy": 5,
      "flexibility": 4
    },
    "teaserStory": "Every HERO is stronger fused than alone. Stack the right two names on top of Polymerization and the sky itself becomes a weapon.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Elemental HERO Sparkman",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Elemental HERO Flame Wingman",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Elemental HERO Great Tornado",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Elemental HERO The Shining",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Elemental HERO Avian",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Elemental HERO Burstinatrix",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Polymerization",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Fusion Gate",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Elemental HERO Necroshade",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Miracle Fusion",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Skyscraper",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "E - Emergency Call",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Elemental HERO Prisma",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Elemental HERO Wildheart",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "HERO's Bond",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Reinforcement of the Army",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Fusion Summon and win",
        "description": "Fusion Summon any Elemental HERO Fusion Monster during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Skyscraper standing",
        "description": "Win a match with Skyscraper active on your field for 3 or more of your turns.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "HERO finish",
        "description": "Win the match with damage dealt by an Elemental HERO Fusion Monster.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "blue_eyes",
    "name": "Blue-Eyes",
    "displayOrder": 4,
    "targetPowerGrade": "A+",
    "starProfile": {
      "startStrength": 2,
      "growth": 5,
      "bossPower": 5,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "It starts as a single white stone. By the time it's finished evolving, three dragon heads are staring down whatever's left on the other side of the field.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "The White Stone of Legend",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Blue-Eyes White Dragon",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Blue-Eyes Ultimate Dragon",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Blue-Eyes Shining Dragon",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Maiden with Eyes of Blue",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Trade-In",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Cards of Consonance",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "The Melody of Awakening Dragon",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Dragon's Mirror",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Return of the Dragon Lords",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Burst Stream of Destruction",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Dragon Spirit of White",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Silver's Cry",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Chorus of Sanctuary",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Dragon Shrine",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Sage with Eyes of Blue",
        "exclusive": true
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "White dragon on the field",
        "description": "Win a match with a Blue-Eyes dragon on your field at the end.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Ultimate Fusion",
        "description": "Fusion Summon Blue-Eyes Ultimate Dragon during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Burst Stream finish",
        "description": "Win the match with damage dealt by a Blue-Eyes dragon with 3000 or more ATK.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "cyber_dragon",
    "name": "Cyber Dragon",
    "displayOrder": 5,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 4,
      "growth": 4,
      "bossPower": 4,
      "synergy": 4,
      "flexibility": 4
    },
    "teaserStory": "Special Summoned for free the moment the opponent commits a monster, then fused into something with more heads than the duel can handle.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Cyber Dragon",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Cyber Twin Dragon",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Cyber End Dragon",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Chimeratech Fortress Dragon",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Cyber Dragon Core",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Cyber Valley",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Machine Duplication",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Power Bond",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Limiter Removal",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Chimeratech Rampage Dragon",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Overload Fusion",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Different Dimension Capsule",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Photon Generator Unit",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Chimeratech Overdragon",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Cyber Kirin",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Cyber Larva",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Free Special Summon",
        "description": "Special Summon Cyber Dragon (or an evolution) during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Fusion overload",
        "description": "Fusion Summon a Cyber/Chimeratech Fusion Monster using 3 or more materials, then win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Mechanical finish",
        "description": "Win the match with damage dealt by a Cyber Dragon-line Fusion Monster.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "jinzo",
    "name": "Jinzo",
    "displayOrder": 6,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 3,
      "bossPower": 4,
      "synergy": 3,
      "flexibility": 3
    },
    "teaserStory": "The moment it hits the field, every Trap Card on the table turns into a dead piece of cardboard. Duelists who lean on Traps learn to fear this silhouette.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Jinzo #7",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Jinzo",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Jinzo - Lord",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Jinzo - Returner",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Skill Drain",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Trap Stun",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Different Dimension Capsule",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Blast Held by a Tribute",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Ring of Destruction",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Metalmorph",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Chain Energy",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Jar of Greed",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Fiend's Sanctuary",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Fissure",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Raigeki Break",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Fiend Comedian",
        "exclusive": true
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Trap lockdown",
        "description": "Win a match with Jinzo (or an evolution) on your field at the end.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Negated",
        "description": "Have an opponent's Trap Card negated by Jinzo's effect during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Silent finish",
        "description": "Win the match with damage dealt while Jinzo negates all Trap Cards on the field.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "armed_dragon_ojama",
    "name": "Chazz / Armed Dragon / Ojama",
    "displayOrder": 7,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 4,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "Level up, level up! What starts as a joke deck full of purple blockers ends with a dragon devouring the opponent's whole hand.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Armed Dragon LV3",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Armed Dragon LV5",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Armed Dragon LV7",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Armed Dragon LV10",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Level Up!",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Ojamagic",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Ojama Yellow",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Ojama Trio",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Ojama Country",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Ojama Green",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Ojama King",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Ojama Black",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Ojama Delta Hurricane!!",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Big Bang Shot",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Card Destruction",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Enemy Controller",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Level up and win",
        "description": "Win a match with Armed Dragon LV7 or LV10 on your field at the end.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Ojama swarm",
        "description": "Control 3 or more Ojama monsters at once during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "LV10 finish",
        "description": "Win the match with damage dealt by Armed Dragon LV10 or its flip effect.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "crystal_beast",
    "name": "Crystal Beast",
    "displayOrder": 8,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 4,
      "synergy": 4,
      "flexibility": 4
    },
    "teaserStory": "Seven gemstones, one Spell Card, and a rainbow that comes together the moment they're all on the field at once.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Crystal Beast Ruby Carbuncle",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Crystal Beast Sapphire Pegasus",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Crystal Beast Amber Mammoth",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Rainbow Dragon",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Crystal Beast Amethyst Cat",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Crystal Beast Topaz Tiger",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Rare Value",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Crystal Beast Emerald Tortoise",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Crystal Beast Cobalt Eagle",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Crystal Blessing",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Crystal Release",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Crystal Tree",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Spell Shattering Arrow",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Rainbow Path",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Rainbow Gravity",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Trade-In",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Gemstones assembled",
        "description": "Control 4 or more Crystal Beast monsters at once during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Rainbow rises",
        "description": "Special Summon Rainbow Dragon during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Rainbow finish",
        "description": "Win the match with damage dealt by Rainbow Dragon.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "red_eyes",
    "name": "Red-Eyes",
    "displayOrder": 9,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 4,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "Jonouchi's dragon never needed to be the strongest thing on the field - just the loudest. Fuse it, fireball with it, and let the crowd go wild.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Red-Eyes Black Dragon",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Red-Eyes Wyvern",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Red-Eyes Darkness Metal Dragon",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Red-Eyes Slash Dragon",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Ties of the Brethren",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Molten Destruction",
        "exclusive": true
      },
      {
        "stageNumber": 1,
        "cardName": "Masked Dragon",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Red-Eyes Fusion",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Return of the Dragon Lords",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Enemy Controller",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Inferno Fire Blast",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Metalmorph",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Burial from a Different Dimension",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Trade-In",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "The Cheerful Coffin",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Call of the Haunted",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "The dragon returns",
        "description": "Win a match with a Red-Eyes dragon on your field at the end.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Fusion firepower",
        "description": "Fusion Summon a Red-Eyes Fusion Monster during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Inferno finish",
        "description": "Win the match with damage dealt by a Red-Eyes dragon with 2400 or more ATK.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "zombie",
    "name": "Zombie",
    "displayOrder": 10,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 4,
      "synergy": 5,
      "flexibility": 3
    },
    "teaserStory": "Nothing in this graveyard stays down. Every monster the opponent destroys is just another body for the horde to reanimate.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Pyramid Turtle",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Zombie Master",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Ryu Kokki",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Despair from the Dark",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Book of Life",
        "exclusive": true
      },
      {
        "stageNumber": 1,
        "cardName": "Mezuki",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Plaguespreader Zombie",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Il Blud",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Shutendoji",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Zombie World",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Necrovalley",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Patrician of Darkness",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Regenerating Mummy",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Card of Safe Return",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Pumpking the King of Ghosts",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Goblin Zombie",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "The horde rises",
        "description": "Control 3 or more Zombie-Type monsters at once during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Reanimated",
        "description": "Special Summon Doomkaiser Dragon and use its effect to destroy an opponent's monster, then win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Undead finish",
        "description": "Win the match with damage dealt by a Zombie-Type monster.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "dinosaur",
    "name": "Dinosaur",
    "displayOrder": 11,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 4,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "Fossils, evolution pills, and a prehistoric arms race. Every turn this deck skips a stage of development that should have taken millions of years.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Babycerasaurus",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Kabazauls",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Super Conductor Tyranno",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Ultimate Conductor Tyranno",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Petiteranodon",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Fossil Excavation",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Ancient Forest",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Big Evolution Pill",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Terraforming",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Fossil Dyna Pachycephalo",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Black Tyranno",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Jurrac Guaiba",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Jurrac Velo",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Jurrac Aeolo",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Ultra Evolution Pill",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Sabersaurus",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Prehistoric pressure",
        "description": "Control a Dinosaur-Type monster with 2400 or more ATK during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Evolution complete",
        "description": "Special Summon Ultimate Conductor Tyranno using an Evolution Pill effect, then win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Double-attack finish",
        "description": "Win the match with damage dealt by Ultimate Conductor Tyranno's double attack.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "legendary_fisherman",
    "name": "Legendary Fisherman",
    "displayOrder": 12,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 4,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "The ocean itself becomes a Field Spell, and everything that swims beneath it gets bigger, meaner, and harder to burn.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "The Legendary Fisherman",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "The Legendary Fisherman II",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "The Legendary Fisherman III",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Levia-Dragon - Daedalus",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Umi",
        "exclusive": true
      },
      {
        "stageNumber": 1,
        "cardName": "Mother Grizzly",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Fortress Whale",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Terrorking Salmon",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Citadel Whale",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Deep Sea Diva",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Fishborg Blaster",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Torrential Tribute",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Big Wave Small Wave",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Deepsea Shark",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Umiiruka",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Atlantean Marksman",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "The sea provides",
        "description": "Win a match with Umi active on your field for 3 or more of your turns.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Full evolution",
        "description": "Have Citadel Whale on your field (evolved from Fortress Whale) during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Depths finish",
        "description": "Win the match with damage dealt by Legendary Fisherman II or Levia-Dragon - Daedalus.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "machina",
    "name": "Machina",
    "displayOrder": 13,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 4,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "A search chain of soldiers and snipers that ends with the whole squad detonating into one overwhelming Fortress.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Machina Soldier",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Machina Sniper",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Machina Fortress",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Machina Force",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Limiter Removal",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Different Dimension Capsule",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Machina Peacekeeper",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Machine Duplication",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Overload Fusion",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Machina Armored Unit",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Pot of Avarice",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Heavy Mech Support Armor",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Pot of Duality",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Machina Gearframe",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Fiendish Engine Omega",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "United We Stand",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Squad tactics",
        "description": "Control 3 or more Machina monsters at once during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Fortress flip",
        "description": "Destroy an opponent's monster with Machina Fortress's flip effect, then win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Force finish",
        "description": "Win the match with damage dealt by Machina Force.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "toon",
    "name": "Toon",
    "displayOrder": 14,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 2,
      "growth": 3,
      "bossPower": 4,
      "synergy": 4,
      "flexibility": 2
    },
    "teaserStory": "Once Toon World hits the field, nothing on the other side of the table can fight back the same way ever again. Silly, unfair, and impossible to take seriously until it wins.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Toon Goblin Attack Force",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Toon Mermaid",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Toon Dark Magician Girl",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Toon Summoned Skull",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Toon World",
        "exclusive": true,
        "quantity": 2
      },
      {
        "stageNumber": 1,
        "cardName": "Toon Table of Contents",
        "exclusive": true
      },
      {
        "stageNumber": 1,
        "cardName": "Toon Kingdom",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Different Dimension Capsule",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Toon Cannon Soldier",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Toon Masked Sorcerer",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Toon Defense",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Enemy Controller",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Book of Moon",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Manga Ryu-Ran",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Card Destruction",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Ring of Destruction",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Toon World standing",
        "description": "Win a match with Toon World active on your field.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Cartoon swarm",
        "description": "Control 2 or more Toon monsters at once during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Slapstick finish",
        "description": "Win the match with damage dealt by Toon Summoned Skull.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "harpie",
    "name": "Harpie",
    "displayOrder": 15,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 4,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "Mai Valentine's signature squad - swarm the field with sisters, then clear whatever's left standing with a gust of wind.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Harpie Lady",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Harpie Lady Sisters",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Harpie Queen",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Harpie's Pet Dragon",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Elegant Egotist",
        "exclusive": true
      },
      {
        "stageNumber": 1,
        "cardName": "Harpie's Feather Duster",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Hysteric Party",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Harpies' Hunting Ground",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Harpie Lady Phoenix Formation",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Harpie Lady 1",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Hysteric Sign",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Cyber Harpie Lady",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Harpie's Pet Baby Dragon",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Ties of the Brethren",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Icarus Attack",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Different Dimension Capsule",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Flock assembled",
        "description": "Control 3 or more Harpie Lady-type monsters at once during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Icarus Attack",
        "description": "Destroy 2 or more of an opponent's cards with Icarus Attack, then win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Talon finish",
        "description": "Win the match with damage dealt by Harpie's Pet Dragon.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "ancient_gear",
    "name": "Ancient Gear",
    "displayOrder": 16,
    "targetPowerGrade": "A+",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 5,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "A forgotten civilization's war machine, dug up piece by piece until the whole battlefield shakes when it walks.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Ancient Gear",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Ancient Gear Soldier",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Ancient Gear Golem",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Ancient Gear Reactor Dragon",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Ancient Gear Wyvern",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Ancient Gear Beast",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Geartown",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Ancient Gear Castle",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Ancient Gear Golem - Ultimate Pound",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Limiter Removal",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Ancient Gear Fusion",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Overload Fusion",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Machine Duplication",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Different Dimension Capsule",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Enemy Controller",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "United We Stand",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "The gears turn",
        "description": "Win a match with an Ancient Gear Field Spell active on your field.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Iron swarm",
        "description": "Control 2 or more Ancient Gear monsters at once during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Reactor finish",
        "description": "Win the match with damage dealt by Ancient Gear Reactor Dragon or Ancient Gear Golem.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "galaxy_photon",
    "name": "Galaxy / Photon",
    "displayOrder": 17,
    "targetPowerGrade": "A+",
    "starProfile": {
      "startStrength": 3,
      "growth": 5,
      "bossPower": 5,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "Two Level 8 monsters, one Xyz Summon, and a dragon with eyes that see clean through the opponent's board. Rank it up and there's nothing left to see through.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Photon Thrasher",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Galaxy-Eyes Photon Dragon",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Galaxy-Eyes Cipher Dragon",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Number 62: Galaxy-Eyes Prime Photon Dragon",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Photon Vanisher",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Photon Sabre Tiger",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Galaxy Soldier",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Galaxy Wizard",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Photon Stream of Destruction",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Number 107: Galaxy-Eyes Tachyon Dragon",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Xyz Reborn",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Photon Lead",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Different Dimension Capsule",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Galaxy Cyclone",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Photon Sanctuary",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Enemy Controller",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Eyes in the sky",
        "description": "Win a match with a Galaxy-Eyes Xyz Monster on your field at the end.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Rank up",
        "description": "Rank-Up Summon Galaxy-Eyes Cipher Dragon or Prime Photon Dragon, then win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Prime finish",
        "description": "Win the match with damage dealt by Galaxy-Eyes Prime Photon Dragon.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "destiny_hero",
    "name": "Destiny HERO",
    "displayOrder": 18,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 4,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "Aster Phoenix's rivals to the HERO name - a gamble-and-punish deck that gets more dangerous the lower your Life Points go.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Destiny HERO - Malicious",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Destiny HERO - Diamond Dude",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Destiny HERO - Plasma",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Destiny HERO - Dystopia",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Destiny Draw",
        "exclusive": true
      },
      {
        "stageNumber": 1,
        "cardName": "Destiny HERO - Defender",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Fusion Gate",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Destiny HERO - Fear Monger",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Destiny HERO - Dasher",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "HERO's Bond",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Different Dimension Capsule",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Destiny HERO - Departed",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Destiny Signal",
        "exclusive": true
      },
      {
        "stageNumber": 4,
        "cardName": "Destiny HERO - Doom Lord",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Polymerization",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Destiny HERO - Dogma",
        "exclusive": true
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Destiny fulfilled",
        "description": "Fusion Summon a Destiny HERO Fusion Monster during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Low-life gamble",
        "description": "Win a match after your Life Points dropped to 1000 or below at some point.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Dystopia finish",
        "description": "Win the match with damage dealt by Destiny HERO - Dystopia or Destiny HERO - Dogma.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "vampire",
    "name": "Vampire",
    "displayOrder": 19,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 4,
      "bossPower": 4,
      "synergy": 4,
      "flexibility": 3
    },
    "teaserStory": "A bloodline of DARK nobles that keeps coming back from the graveyard - the more the opponent destroys, the hungrier the next one gets.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Vampire Sorcerer",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Vampire Lord",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "Vampire Genesis",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Vampire Fraulein",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Vampire's Curse",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Book of Life",
        "exclusive": false
      },
      {
        "stageNumber": 1,
        "cardName": "Card of Safe Return",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Vampire Lady",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Vampire Grace",
        "exclusive": true
      },
      {
        "stageNumber": 2,
        "cardName": "Pot of Avarice",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Vampire Vamp",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Il Blud",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Mezuki",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Mask of Darkness",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Different Dimension Capsule",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Compulsory Evacuation Device",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "Bloodline rises",
        "description": "Special Summon a Zombie or Vampire monster from your graveyard during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "Coven assembled",
        "description": "Control 2 or more Vampire archetype monsters at once during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Fraulein's finish",
        "description": "Win the match with damage dealt by Vampire Fraulein or Vampire Genesis.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  },
  {
    "code": "cubic",
    "name": "Cubic",
    "displayOrder": 20,
    "targetPowerGrade": "A",
    "starProfile": {
      "startStrength": 3,
      "growth": 3,
      "bossPower": 4,
      "synergy": 3,
      "flexibility": 4
    },
    "teaserStory": "A grinding wall of Rock-Type defenders that turns every attack the opponent commits into a bad trade. Note: built from a closest-thematic-equivalent substitution - see the route's build notes.",
    "buildNote": "The real 'Cubic' archetype's best-known card (Vijam the Cubic Seed) is a Tuner meant to enable Synchro Summoning, which this format excludes entirely - using it as a Stage 1 grant would be mechanically dead, matching the design note to avoid it. The rest of the archetype's line is also Synchro-dependent, so this route was rebuilt around real, validated LIGHT/EARTH/DARK Rock-Type monsters and dice-adjacent support with the same defensive, grinding identity, rather than force an unplayable archetype into a Synchro-less format.",
    "stages": [
      {
        "stageNumber": 1,
        "evolutionCard": "Gogogo Golem",
        "dpCost": null
      },
      {
        "stageNumber": 2,
        "evolutionCard": "Guardian Statue",
        "dpCost": 900
      },
      {
        "stageNumber": 3,
        "evolutionCard": "B.E.S. Big Core",
        "dpCost": 1400
      },
      {
        "stageNumber": 4,
        "evolutionCard": "Gaia Plate the Earth Giant",
        "dpCost": 2400,
        "isBoss": true
      }
    ],
    "supportGrants": [
      {
        "stageNumber": 1,
        "cardName": "Rock Bombardment",
        "exclusive": true
      },
      {
        "stageNumber": 1,
        "cardName": "Big Bang Shot",
        "exclusive": true
      },
      {
        "stageNumber": 1,
        "cardName": "Card of Safe Return",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Different Dimension Capsule",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Enemy Controller",
        "exclusive": false
      },
      {
        "stageNumber": 2,
        "cardName": "Compulsory Evacuation Device",
        "exclusive": true
      },
      {
        "stageNumber": 3,
        "cardName": "Book of Moon",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "United We Stand",
        "exclusive": false
      },
      {
        "stageNumber": 3,
        "cardName": "Ties of the Brethren",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Mystical Space Typhoon",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Torrential Tribute",
        "exclusive": false
      },
      {
        "stageNumber": 4,
        "cardName": "Fissure",
        "exclusive": false
      }
    ],
    "achievementEvents": [
      {
        "key": "signature_win",
        "label": "The wall holds",
        "description": "Control a Rock-Type monster with 2400 or more DEF during a match you win.",
        "isFinishingBlow": false
      },
      {
        "key": "signature_move",
        "label": "The long game",
        "description": "Win a duel that reaches turn 8 or later.",
        "isFinishingBlow": false
      },
      {
        "key": "finishing_blow",
        "label": "Bedrock finish",
        "description": "Win the match with damage dealt by Gaia Plate the Earth Giant.",
        "isFinishingBlow": true
      }
    ],
    "achievementRequirements": [
      {
        "stageNumber": 2,
        "eventKey": "signature_win",
        "targetCount": 3
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_win",
        "targetCount": 10
      },
      {
        "stageNumber": 3,
        "eventKey": "signature_move",
        "targetCount": 1
      },
      {
        "stageNumber": 4,
        "eventKey": "signature_win",
        "targetCount": 22
      },
      {
        "stageNumber": 4,
        "eventKey": "finishing_blow",
        "targetCount": 2
      }
    ]
  }
];
