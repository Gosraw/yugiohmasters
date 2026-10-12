# Card pool 2.0: data foundation (2026-10-12)

## Samenvatting voor de eigenaar (Nederlands)

**Wat is de kaartpool nu?**
De 2.0-pool heet "Duelist Circle Classic". Er zitten **6.236 kaarten** in:

- 6.211 kaarten die in de TCG zijn uitgekomen tot en met 31-12-2014,
- plus 25 later uitgekomen kaarten (2015–2018) die we eerder met de hand hebben toegevoegd, zoals Chocolate Magician Girl en Red-Eyes Fusion.

Van die 6.236 zijn er **6.136 speelbaar**. De andere 100 zijn verboden.
Fusion- en Xyz-monsters mogen in het Extra Deck. Synchro, Link en Pendulum mogen niet. Ritual-monsters mogen wel, want die staan in het Main Deck.

**Wat valt eruit, en waarom?**

- **Synchro/Link/Pendulum-monsters** (211 kaarten uit de periode t/m 2014). Die vallen eruit door de formaatregel.
- **110 kaarten die alleen werken als je Synchro, Pendulum of Link hebt.** Voorbeelden zijn Junk Synchron, Synchro Barrier en Tuning. Het "lek" dat je zag is hiermee gedicht. Kaarten die ook zonder Synchro nog iets doen, blijven erin, zoals Tour Guide From the Underworld en Debris Dragon.
- **23 kaarten die niet in Master Duel bestaan.** Voorbeelden: Victory Dragon, Mooyan Curry, Convulsion of Nature en Elemental HERO Air Neos.
- **8 kaarten die we eerder al bewust hadden geschrapt.** Dat zijn het Invoked/Aleister-pakket en Rhongomyniad.

**De basis-banlijst** is de officiële TCG-lijst die eind 2014 gold. Die lijst ging in op 1 oktober 2014 en liep tot 31 december 2014. Daarop staan 74 verboden, 70 limited en 16 semi-limited kaarten. Bijvoorbeeld: Pot of Greed en Heavy Storm zijn verboden, Raigeki en Dark Hole zijn limited.

**Waar stemt de groep over?**
Een voorstel met 61 "oneerlijke" kaarten:

- **38 verbieden.** Dit zijn lock- en stall-kaarten (Yata-Garasu, Imperial Order, Vanity's Fiend, Gravity Bind, Barrier Statues …), combo-motoren die in één beurt winnen of oneindig burnen (Magical Explosion, Chain Material, Cannon Soldier, Wind-Up Magician) en Chaos Emperor Dragon.
- **10 maximaal 1 per deck.** Dit zijn zachtere gevallen, zoals Skill Drain, Spell Canceller en Chain Strike.
- **13 Legendary (1 exemplaar in de hele league).** Dit zijn kaarten die het bord leegvegen: Raigeki, Dark Hole, Harpie's Feather Duster, Heavy Storm, Mirror Force, Torrential Tribute, Lightning Vortex enzovoort.

Elke kaart heeft een zekerheid: hoog, middel of laag. Begin bij de kaarten met "laag", want daar is jullie mening het hardst nodig.
Alternatieve winvoorwaarden blijven toegestaan: Exodia, Final Countdown, Destiny Board en Vennominaga.

**Wat zijn "legacy"-kaarten in Master Duel?**
In Master Duel betekent "legacy" de **Legacy Pack**. Dat is een gratis pakje van 2 kaarten dat je koopt met Legacy Pack-tickets. Die tickets verdien je door te duelleren, met Solo Mode en met missies. In dat pakje zitten ongeveer 4.000 kaarten, het grootste deel van het spel.

Kaarten uit een Legacy Pack kun je **niet ontmantelen** (je krijgt er geen craft-punten voor terug). Je kunt ze wel **gewoon spelen**, in elke modus en ook in "Unlimited"-duel-rooms. "Legacy" is dus geen reden om een kaart uit te sluiten. Als we dat wel deden, zou bijna de hele pool verdwijnen.

**Advies:** sluit alleen kaarten uit die niet in Master Duel bestaan. Dat zijn er 23 in onze pool.
De Master Duel-banlijst telt niet mee, want jullie spelen in rooms waar de verboden/limited-instelling op "Unlimited" staat.

**Let op: botsingen met Boss Routes.**
Een paar Boss Routes delen kaarten uit die nu verboden of Legendary worden:

- Het grootste probleem: de eindbaas (stage 4) van de **Chaos/BLS-route is Chaos Emperor Dragon**, en die wil je juist eruit hebben.
- Dark Magician of Chaos is de eindbaas van de Dark Magician-route, maar staat sinds 2014 op de verboden lijst.
- Harpie's Feather Duster en Torrential Tribute worden als support uitgedeeld. Dat zou extra exemplaren van een "1 per league"-kaart opleveren.

In totaal zijn er 17 van zulke botsingen. Daarnaast zijn er 38 route-kaarten van na 2014 die niet in de pool zitten. Een voorbeeld is de hele Cubic-route. Voor elk geval moet jij beslissen.

---

## Technical detail (English)

### Files

| File | What |
|---|---|
| `scripts/cardpool/fetch-catalog.mjs` | Downloads `https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes` → `data/external/ygoprodeck-cardinfo.json` (git-ignored, ~25 MB, 14,606 cards, DB v147.29). Skips if < 24 h old; `--force` re-downloads. |
| `scripts/cardpool/fetch-era-banlist.mjs` | Pulls the raw wikitext of Yugipedia "October 2014 Lists (TCG)" and writes `data/banlists/tcg-2014-10.json`. It also cross-checks every name against the snapshot. |
| `data/banlists/tcg-2014-10.json` | Official TCG F&L, effective 2014-10-01 to 2014-12-31 (superseded by the January 2015 list). 74 forbidden / 70 limited / 16 semi-limited. Name fix: Yugipedia's "Morphing Jar 2" is the official **Morphing Jar #2** (page titles can't contain `#`). After the fix, every name matches the catalog exactly. |
| `data/banlists/duelist-circle-proposal.json` | The 61-entry "unfair" proposal `{name, verdict, category, reason, confidence}` and the cards deliberately not listed. |
| `data/cardpool/overrides.json` | Curated includes/excludes, copied from `202608300900_*`, `202608301200_*` and `202609011200_*` with per-entry provenance. Also 7 manual "mechanic_leak" excludes from this review. |
| `scripts/cardpool/build-pool.mjs` | Builds the pool (offline, no DB). |
| `data/cardpool/classic-v2-pool.json` | `{summary, cards[]}`. Each card has id, name, type, release_date, era, source (`core`/`curated_include`), `in_md`, `md_rarity`, `era_banlist`, `dc_verdict`, `dc_category`, `final_status`, `max_copies_per_deck`, `league_unique` and `playable`. |
| `data/cardpool/classic-v2-excluded.json` | Every card that is in era scope but was removed, with the reason and detail. |
| `data/cardpool/classic-v2-review.json` | 95 soft mechanic mentions that were **kept**, for a human spot-check. |
| `data/cardpool/classic-v2-summary.json` | Counts, the list of verdicts that override the 2014 list, and the Boss Route cross-check. |

### Eligibility precedence (`build-pool.mjs`)

1. Skill Cards / Tokens: out of scope.
2. Not in Master Duel (`misc_info.formats` lacks "Master Duel"): excluded. This beats overrides. I spot-checked it against `?format=master duel`, and the two agree.
3. Manual exclude: excluded. For a `mechanic_leak` entry, the reason is reported as `mechanic_text_dependency`.
4. Manual include: IN, and checks 5–7 are skipped.
5. Synchro/Link/Pendulum/Illusion by type: excluded. This includes hybrids such as Pendulum Fusion/Xyz.
6. Hard mechanic text dependency: excluded (see below).
7. Release date (`tcg_date`, falling back to `ocg_date` for old OCG-only cards that exist in MD, e.g. 1999 OCG vanillas) must be ≤ 2014-12-31. An unknown date is excluded (1 card catalog-wide, and it is not in the era scope).
8. Otherwise: IN.

**Status:** if a card has a proposal verdict, that verdict wins. Otherwise the 2014 status applies. This is deliberate, because the owner re-rated era-forbidden cards such as Harpie's Feather Duster to Legendary.
The verdicts that change a 2014 status are:

| Card | 2014 status | Proposed |
|---|---|---|
| Harpie's Feather Duster | forbidden | legendary |
| Heavy Storm | forbidden | legendary |
| Giant Trunade | forbidden | legendary |
| Raigeki | limited | legendary |
| Dark Hole | limited | legendary |
| Torrential Tribute | limited | legendary |
| Magical Explosion | limited | forbidden |
| Wall of Revealing Light | limited | forbidden |
| Wind-Up Magician | limited | forbidden |
| Chain Strike | semi-limited | 1 per deck |

The Master Duel banlist is ignored.

### The Synchro leak fix

The old SQL format engine only excluded by *card type*. The text-dependency layer existed only as a script and never ran live, so Junk Synchron (whose text doesn't mention Synchro at all) and Synchro Barrier stayed in the pool. The new `classifyMechanicDependency()` works sentence by sentence:

- **Synchron-family cards are always hard.** That means "Synchron" in the name, or a quoted "Synchron" reference in the text.
- **Restriction clauses are cut out first.** Examples: "cannot be used as Synchro Material, except …" and "you cannot Synchro Summon the turn …". They limit a card but never make it dead, which is why Tour Guide, Box of Friends and Backup Warrior stay.
- **Mechanic-bound sentences.** A sentence counts as mechanic-bound if it mentions Synchro/Pendulum/Link, "treated as a Tuner", or a quoted name of an excluded Synchro/Link/Pendulum card.
  - Optional riders ("…, then you can Special Summon 1 "Stardust Dragon"") are ignored.
  - So are alternatives that include an allowed mechanic ("Ritual, Fusion or Synchro Monster").
- **Hard when any of these holds:**
  - every functional sentence is mechanic-bound;
  - a Spell/Trap's first condition or cost needs the mechanic (Synchro Barrier: "Tribute 1 Synchro Monster you control"), unless a quoted-name alternative exists ("Power Tool Dragon or … Morphtronic");
  - the card's only text is a Synchro-material restriction (Majestic Dragon);
  - a Fusion/Xyz monster's material line needs the mechanic.
- **Result:** 103 automatic and 7 manual exclusions in the Classic scope. The 95 soft mentions were kept; see `classic-v2-review.json`. Notable keeps there: the Yang Zing main-deck monsters and Merlin, which still have Xyz/search effects.

### Master Duel "legacy" research

- **Legacy Pack.** It is a Master Duel bonus pack bought with Legacy Pack tickets. Those tickets come from Duels, Solo Mode and missions. The pack holds roughly 4,000 cards (3,971 at launch). Legacy Pack cards **cannot be dismantled**, but most Legacy-exclusive cards can be crafted. Sources: [Yugipedia – Legacy Pack](https://yugipedia.com/wiki/Legacy_Pack) and [Upcomer – best cards in Legacy Packs](https://upcomer.com/?p=112043).
- **Unlimited rooms.** Duel Room settings offer a Forbidden/Limited option of Standard, **Unlimited**, Fusion, Synchro, Xyz or Link. There is no Legacy-related restriction. Source: [Yugipedia – Free Duel (Master Duel)](https://yugipedia.com/wiki/Free_Duel_(Master_Duel)).
- **What "legacy" doesn't mean.** No other "legacy" card category exists in Master Duel that limits play. "Legacy of the Duelist" is a different game.
- **Conclusion.** The only Master Duel gate is existence in Master Duel. In the Classic scope, 23 cards fail it:
  - ???
  - Bait Doll
  - Chimaera, the Master of Beasts
  - Convulsion of Nature
  - Double Spell
  - Elemental HERO Air Neos
  - Emperor of Lightning
  - Get Your Game On!
  - Holactie the Creator of Light
  - King of Destruction - Xexex
  - Magi Magi ☆ Magician Gal
  - Meteo the Matchless
  - Mooyan Curry
  - Nanana
  - Pole Position
  - Queen of Fate - Eternia
  - Shuttleroid
  - Spellbinding Circle
  - Spirit Elimination
  - Testament of the Arcane Lords
  - Tyler the Great Warrior
  - Ulevo
  - Victory Dragon
- **Follow-up in app code (not done here).** The current SQL gate `is_master_duel_offerable()` also blocks MD-*forbidden* cards. For 2.0 it should check existence only.

### Unfair proposal: method

- **Inputs.** The proposal combines known historical lock/FTK/burn-loop cards, text heuristics over the Classic pool, and judgment. The heuristics were run with `neither player can`, `your opponent cannot …`, `skip`, `cannot declare an attack`, `destroy all …` and repeated `inflict … damage`.
- **Errata'd text.** Judgment uses the current, errata'd text that Master Duel uses. That is why Catapult Turtle (now once per turn) is not listed.
- **Not banned on purpose.** Jinzo is a Boss Route boss and a removable body. Necrovalley is the Gravekeeper core. Cards already Limited in 2014 are left alone.
- **Breakdown.** 29 floodgates, 7 stall, 3 turn-skip, 2 FTK engines, 4 burn loops, 2 hand loops, 1 board+hand wipe (CED) and 13 mass removal.
- **Confidence.**

  | Verdict | high | medium | low |
  |---|---|---|---|
  | forbidden | 12 | 23 | 3 |
  | 1 per deck | 0 | 1 | 9 |
  | legendary | 3 | 6 | 4 |

### Boss Route cross-check

`build-pool.mjs` imports `data/boss-route-registry.mjs` and checks every evolution card and support grant. It found:

- **17 blocking cases.** These are route cards that are forbidden or Legendary:
  - Chaos Emperor Dragon is the Chaos/BLS stage-4 boss.
  - Dark Magician of Chaos is the DM stage-4 boss (2014: forbidden).
  - Dimension Fusion, Return from the Different Dimension, Card of Safe Return, Ring of Destruction, Card Destruction, Pot of Avarice and Fishborg Blaster are 2014-forbidden support grants.
  - Fossil Dyna Pachycephalo is a Dinosaur grant.
  - Torrential Tribute and Harpie's Feather Duster are grants that would mint extra copies of a league-unique card.
- **38 era gaps.** These are route cards from after 2014 that are not in the pool. Examples are the whole Cubic route and Red-Eyes Slash Dragon. You need to decide whether route cards automatically join the pool.
- **14 informational cases.** These are route cards that are limited or semi-limited.

The full list is in `classic-v2-summary.json` → `boss_route_issues`.

### How to rerun

```
node scripts/cardpool/fetch-catalog.mjs          # refresh snapshot (or --force)
node scripts/cardpool/fetch-era-banlist.mjs      # optional: rebuild 2014 list from Yugipedia
node scripts/cardpool/build-pool.mjs             # rebuild pool + reports
```

After the group vote, edit `data/banlists/duelist-circle-proposal.json` (change or remove entries) and rerun `build-pool.mjs`. If override migrations change, mirror them in `data/cardpool/overrides.json`.

Nothing here touches Supabase. Writing the pool and statuses into the test DB (`format_card_overrides`, rarity/Legendary, ban status) is a separate step.
