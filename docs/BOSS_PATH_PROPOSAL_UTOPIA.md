# Voorstel: Boss Path Utopia (niet live)

*Uitgewerkt op 14 november 2026 om te bekijken. Hij staat **niet** in de app: Samo houdt Ancient Gear. Als iemand hem later wil spelen, kan hij zo worden toegevoegd.*

Hij is gecontroleerd met dezelfde regels als de 15 echte routes: alle kaarten zijn er in Master Duel, er zit niets met Synchro, Link of Pendulum in, en geen enkele kaart zit al in een andere route. De score is **79.8**, met de 15 live routes erbij is het gemiddelde 78.7, dus hij zit binnen alle grenzen.

## De route

**Zo speel je het:** Maak van twee monsters van level 4 een Utopia en houd daarmee aanvallen tegen. Daarna maak je hem steeds sterker: je zet een hogere Utopia bovenop hem en geeft hem ZW-pantser, tot één krijger harder slaat dan alles wat je tegenstander ervoor kan zetten.

| Stage | Evolutie | Steunkaarten |
|---|---|---|
| 1 (gratis) | Number 39: Utopia | ZS - Armed Sage ✦ · ZW - Sleipnir Mail · Xyz Change Tactics |
| 2 | Number C39: Utopia Ray V | Rank-Up-Magic Limited Barian's Force · ZW - Tornado Bringer · Utopia Buster |
| 3 | Number 39: Utopia Beyond | Rank-Up-Magic Astral Force · ZW - Lightning Blade · Rising Sun Slash |
| 4 (Boss) | Number S39: Utopia the Lightning ✦ | Halfway to Forever ✦ · Reverse Breaker |

**Zo komen de evoluties op het veld:**

- **Utopia** (Rank 4): twee monsters van level 4. Met ZS - Armed Sage lukt dat al met 2 kaarten.
- **Utopia Ray V** (Rank 5): leg Rank-Up-Magic Limited Barian's Force op Utopia. Met Utopia eronder vernietigt hij 1 keer per beurt een monster en doet hij schade gelijk aan de aanval van dat monster.
- **Utopia Beyond** (Rank 6): leg Rank-Up-Magic Astral Force op Utopia. Bij het oproepen wordt de aanval van alle monsters van de tegenstander 0.
- **Utopia the Lightning** (Boss, Rank 5): zet hem direct bovenop een Utopia van Rank 4, daar heb je geen spell voor nodig.

**Buiten de pool, en waarom dat eerlijk is:**

- **Number S39: Utopia the Lightning**: Komt bovenop een Rank 4-Utopia, die daarmee zijn materiaal wordt. Zolang hij vecht kan de tegenstander niets activeren, en 1 keer per keten kan hij 2 materialen inleveren om met 5000 aan te vallen. Met de materialen van Utopia plus Utopia zelf zijn dat één of twee grote klappen. Daarna is hij een gewone aanvaller van 2500. Hij kan niets weghalen buiten gevechten om en kan niet als materiaal dienen.
- **ZS - Armed Sage**: Level 4 die zichzelf uit je hand oproept als je enige monster één ander level 4-monster is. Zo maak je Utopia met 2 kaarten. Een Utopia die met hem is gemaakt zoekt 1 ZW-monster. 1 keer per beurt.
- **Halfway to Forever**: Trap die 2 monsters uit je kerkhof terughaalt, met hun effecten uit, en er meteen een LIGHT-Utopia van maakt. Een kaart om terug te komen, met één Xyz per keer.

**Waarom niet de sterkste Utopia-kaarten:** Number S0: Utopic ZEXAL zet het spel van de tegenstander op slot, Shining Hope Road en Utopic Onomatopoeia geven te veel gratis monsters, en de nieuwere Zexal-spells zoeken te makkelijk alles bij elkaar. Die blijven er daarom uit.

**Balans:** score **79.8** (+1.4% t.o.v. gemiddeld). Kaartkracht per stage 18 / 20 / 19 / 17 (totaal 74); betrouwbaarheid 7, interactie 7, Boss-impact 8, slechtste/beste potje 5/8 (op 10). Sterren: start 3, groei 3, Boss 4, samenwerking 4, flexibel 4 (op 5).

## Toevoegen als hij ooit live moet (technisch)

1. Zet het blok hieronder terug in `data/boss-route-registry-v3.mjs` (vóór de laatste `];`) en draai
   `node scripts/generate-boss-routes-v3-migration.mjs --check` en
   `node scripts/boss-route-balance.mjs --check`.
2. De SQL staat al klaar: `supabase/migrations/202611141000_utopia_route.sql` (opnieuw toepassen
   maakt de route weer aan; `202611141100_remove_utopia_route.sql` haalde hem weg).
3. Zet de tests terug: 16 routes / 241 kaarten in `scripts/sql-tests/59_boss_routes_v3.sql`
   (zie commit 3ef99be, ook voor `65_utopia_route.sql`).

```js
  {
    // Proposal only (2026-11-14), not live.
    code: "s2_utopia",
    name: "Utopia",
    displayOrder: 16,
    identity: null,
    targetPowerGrade: "A",
    starProfile: { startStrength: 3, growth: 3, bossPower: 4, synergy: 4, flexibility: 4 },
    teaserStory: "A boy who never gives up, and the warrior of hope who answers when he calls. Every time it looks lost, the armour gets one piece heavier and the sword one piece brighter.",
    howItPlays: "Stack two Level 4 monsters into Utopia, stop attacks with it, then rank it up and strap ZW armour onto it until one warrior hits harder than anything your opponent can put in front of it.",
    playStyle: ["xyz", "equip", "beatdown"],
    stages: [
      { stageNumber: 1, evolutionCard: "Number 39: Utopia", impact: 5 },
      { stageNumber: 2, evolutionCard: "Number C39: Utopia Ray V", impact: 6 },
      { stageNumber: 3, evolutionCard: "Number 39: Utopia Beyond", impact: 6 },
      { stageNumber: 4, evolutionCard: "Number S39: Utopia the Lightning", impact: 8, isBoss: true },
    ],
    supportGrants: [
      { stageNumber: 1, cardName: "ZS - Armed Sage", exclusive: true, impact: 5 },
      { stageNumber: 1, cardName: "ZW - Sleipnir Mail", exclusive: false, impact: 4 },
      { stageNumber: 1, cardName: "Xyz Change Tactics", exclusive: false, impact: 4 },
      { stageNumber: 2, cardName: "Rank-Up-Magic Limited Barian's Force", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "ZW - Tornado Bringer", exclusive: false, impact: 5 },
      { stageNumber: 2, cardName: "Utopia Buster", exclusive: false, impact: 4 },
      { stageNumber: 3, cardName: "Rank-Up-Magic Astral Force", exclusive: false, impact: 5 },
      { stageNumber: 3, cardName: "ZW - Lightning Blade", exclusive: false, impact: 4 },
      { stageNumber: 3, cardName: "Rising Sun Slash", exclusive: false, impact: 4 },
      { stageNumber: 4, cardName: "Halfway to Forever", exclusive: true, impact: 5 },
      { stageNumber: 4, cardName: "Reverse Breaker", exclusive: false, impact: 4 },
    ],
    balance: { consistency: 7, interaction: 7, bossImpact: 8, floor: 5, ceiling: 8 },
    fairness: {
      "Number S39: Utopia the Lightning": "Rank 5, made by putting it on top of a Rank 4 Utopia (that Utopia becomes its material). While it battles the opponent cannot respond, and once per chain it can detach 2 materials to hit with 5000 ATK. With Utopia's 2 materials plus Utopia itself that is one or two big hits, then it is a plain 2500 beater. No removal off the battlefield, and it cannot be used as material.",
      "ZS - Armed Sage": "Level 4 that summons itself from hand when your only monster is one other Level 4, so it makes Utopia from two cards. A Utopia made with it searches one ZW monster. Once per turn.",
      "Halfway to Forever": "Trap: revive 2 monsters from your GY with their effects negated and immediately make a LIGHT Utopia from them. A comeback card, one Xyz per activation.",
    },
  },
```
