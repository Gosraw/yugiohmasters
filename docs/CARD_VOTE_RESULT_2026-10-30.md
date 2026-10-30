# Uitslag kaartstemming (2026-10-30)

**Status: TOEGEPAST (30 oktober 2026).** Jij hebt de uitslag goedgekeurd, met de besluiten hieronder.
De uitslag zit nu in de bestanden en in `supabase/migrations/202610301200_classic_v2_format_after_vote.sql`. Dat bestand gaat op de lanceeravond mee met de andere migraties.

## Besluit eigenaar (30 oktober 2026)

1. **De stemming is dicht.** Vlak voor het toepassen is alles nog één keer geteld, alleen door te lezen. Er was niets veranderd: dezelfde 542 stemmen en dezelfde 222 veranderingen. De laatste stem was van 15 oktober.
2. **Alle 34 kaarten die terugkomen uit "verboden" mogen maximaal 1 keer per deck,** elk met de zeldzaamheid waarop gestemd is. Dat geldt ook voor Imperial Order, Royal Oppression, Time Seal, Gravity Bind, de Barrier Statues, de Vanity-kaarten, Cannon Soldier en Magical Explosion.
3. **Giant Trunade** (Legendary → Secret Rare) mag ook **maximaal 1 keer per deck**.
4. **Mind Drain** wordt 3 per deck, zoals gestemd. Hij blijft Ultra Rare.
5. **21 Legendaries is goed.** De vrijgekomen plekken worden niet opgevuld. Kaarten waarover niet gestemd is, houden precies hun zeldzaamheid (dat is ook nagecontroleerd).
6. **De 33 kaarten met een gelijkspel** blijven zoals voorgesteld. Er zijn geen aanpassingen.

**Gevolg voor de banlijst:**
- 69 kaarten zijn verboden.
- 104 kaarten mogen maximaal 1 keer per deck (was 70).
- 15 kaarten mogen maximaal 2 keer per deck.

## Hoe is er geteld?

- **Wie stemde:** sam stemde op alle 409 kaarten, faro op 124 en bossg (jij) op 9 in de app.
- **Jouw oude stemmen:** jouw 52 stemmen van de oude stempagina zijn ook meegeteld. Bij 5 kaarten had je óók in de app gestemd; dan telt de stem uit de app. In de tabellen staat een **\*** achter bossg als het een oude stem is.
- **De regel (jouw keuze):**
  - Per kaart beslist de meerderheid van wie er gestemd heeft.
  - Bij een gelijkspel blijft het voorstel staan. Er waren geen beslissingen van jou als admin (tiebreaks) in de database.
  - Bij **"Toestaan"** op een verboden kaart wordt de zeldzaamheid de keuze die het vaakst gekozen is. Bij een gelijke stand wordt het de hoogste van die keuzes.
- **Wat betekent "te sterk" / "te zwak"?**
  - **Te sterk** = één stap zeldzamer. Een Legendary of "max 1 per deck" wordt dan verboden.
  - **Te zwak** = één stap gewoner. Legendary wordt Secret Rare, en "max 1 per deck" wordt 3 per deck.

## Totaal

Van de 409 kaarten veranderen er **222**. 187 blijven zoals voorgesteld: 154 omdat de meerderheid "klopt" stemde en 33 door een gelijkspel. Toon Alligator kreeg "te zwak", maar is al Normal en kan niet lager.

| Soort verandering | Aantal |
|---|---|
| Verboden → **toegestaan** (max 1 per deck) | **34** (19× Secret Rare, 10× Ultra Rare, 2× Super Rare, 3× Rare) |
| Legendary → Secret Rare | **21** |
| Legendary → **verboden** | **3** (Sophia, Goddess of Rebirth · Meklord Emperor Wisel · Evilswarm Exciton Knight) |
| Max 1 per deck → 3 per deck | **1** (Mind Drain; blijft Ultra Rare) |
| Zeldzamer: Ultra Rare → Secret Rare | 9 |
| Zeldzamer: Super Rare → Ultra Rare | 3 |
| Zeldzamer: Rare → Super Rare | 16 |
| Zeldzamer: Normal → Rare | 9 |
| Gewoner: Secret Rare → Ultra Rare | 30 |
| Gewoner: Ultra Rare → Super Rare | 76 |
| Gewoner: Super Rare → Rare | 14 |
| Gewoner: Rare → Normal | 6 |
| **Samen** | **222** |

### Wat betekent dit voor de kaartenpool?

- **Speelbare kaarten:** van 6.136 naar **6.167**. Er komen 34 kaarten bij en er gaan er 3 af.
- **Verboden kaarten in de pool:** van 100 naar **69**.
- **Zeldzaamheden:**

  | | Nu | Na de stemming |
  |---|---|---|
  | Legendary | 45 | **21** |
  | Secret Rare | 200 | 219 |
  | Ultra Rare | 1.145 | 1.103 |
  | Super Rare | 1.193 | 1.270 |
  | Rare | 1.509 | 1.513 |
  | Normal | 2.044 | 2.041 |

- **Andere kaarten veranderen niet.** Kaarten waarover niet gestemd is, houden precies hun zeldzaamheid. Er schuift dus niets mee.

### Opvallend

- **Bijna alle "vloerkaarten" mogen terug.** Bijvoorbeeld Imperial Order, Royal Oppression, Gravity Bind, Level Limit - Area B, Messenger of Peace, Vanity's Emptiness/Fiend/Ruler, alle 6 Barrier Statues, Anti-Spell Fragrance, Mask of Restrict en Royal Decree. De meeste worden Secret Rare of Ultra Rare.
- **Deze 4 blijven verboden:**
  - Chaos Emperor Dragon - Envoy of the End
  - Yata-Garasu
  - Arcana Force XXI - The World
  - D.D. Borderline (door een gelijkspel)
- **Deze 3 worden nieuw verboden:** Sophia, Goddess of Rebirth, Meklord Emperor Wisel en Evilswarm Exciton Knight.
- **Van de 13 Legendary bord-wipes blijft bijna alles Legendary.** Alleen Giant Trunade wordt Secret Rare, en Evilswarm Exciton Knight wordt verboden.
- **Van de 32 andere Legendaries worden er 20 Secret Rare.** Daardoor zijn er straks maar 21 Legendaries in plaats van 45.
- **Bij 150 van de 222 veranderingen heeft alleen sam gestemd.** Volgens de regel telt dat gewoon, want hij was de enige stemmer. Het zijn vooral de Boss Route-lijsten. Kijk daar even naar als je wilt.

## Vragen die er waren (zijn nu beantwoord, zie "Besluit eigenaar")

1. **Hoeveel per deck mogen 4 kaarten die op de officiële lijst van oktober 2014 verboden waren?**
   - Het gaat om Imperial Order, Royal Oppression, Time Seal en Giant Trunade.
   - De groep wil ze in het spel hebben. Giant Trunade is gestemd als Secret Rare in plaats van Legendary.
   - **Mijn voorstel:** 3 per deck, dus gewoon toegestaan. Er bestaan van een Secret Rare toch maar 3 exemplaren in de hele league.
   - **De andere keuze:** max 1 per deck.
   - **De overige toegestane kaarten** volgen gewoon de lijst van 2014. Drie daarvan stonden daar op "max 1 per deck" (Magical Explosion, Wall of Revealing Light en Wind-Up Magician), dus die blijven max 1 per deck. De rest wordt 3 per deck.
2. **Legendary gaat van 45 naar 21. Is dat goed?**
   - **Mijn voorstel:** zo laten. Als we de lege plekken opvullen, worden kaarten Legendary waarover niemand gestemd heeft.
3. **Gelijkspel:** 33 kaarten bleven op het voorstel door een gelijke stand. Ze staan onderaan. Wil je er eentje anders, zeg het dan.
4. **Is de stemming dicht?** Als er nog gestemd wordt, kan de uitslag veranderen. Vlak voor het toepassen tel ik opnieuw en meld ik verschillen.

## Gelijkspel: deze kaarten bleven op het voorstel

Hier kun jij beslissen als je wilt. Anders blijft het voorstel staan.

| Kaart | Lijst | Voorstel (blijft) | Stemmen |
|---|---|---|---|
| D.D. Borderline | Voorstel: verboden | Verboden | faro: toestaan (Rare) · sam: buiten houden |
| Chain Strike | Voorstel: max 1 per deck | Max 1 per deck | faro: te zwak · sam: klopt |
| Elemental Absorber | Voorstel: max 1 per deck | Max 1 per deck | faro: te zwak · sam: klopt |
| Light-Imprisoning Mirror | Voorstel: max 1 per deck | Max 1 per deck | faro: te zwak · sam: te sterk |
| Shadow-Imprisoning Mirror | Voorstel: max 1 per deck | Max 1 per deck | faro: te zwak · sam: te sterk · bossg\*: klopt |
| Toon Cannon Soldier | Voorstel: max 1 per deck | Max 1 per deck | faro: te sterk · sam: te zwak |
| Wind-Up Hunter | Voorstel: max 1 per deck | Max 1 per deck | faro: te zwak · sam: klopt |
| Elemental HERO Absolute Zero | Voorstel: Legendary bord-wipes | Legendary | faro: te zwak · sam: te sterk · bossg\*: klopt |
| Judgment Dragon | Voorstel: Legendary bord-wipes | Legendary | faro: te zwak · sam: klopt · bossg\*: te sterk |
| Dark Dust Spirit | Legendary-kaarten | Legendary | faro: te zwak · sam: klopt · bossg\*: te sterk |
| Darklord Asmodeus | Legendary-kaarten | Legendary | faro: klopt · sam: te zwak |
| Final Inzektion | Legendary-kaarten | Legendary | faro: klopt · sam: te zwak |
| Sephylon, the Ultimate Timelord | Legendary-kaarten | Legendary | faro: te sterk · sam: klopt |
| Tualatin | Legendary-kaarten | Legendary | faro: te sterk · sam: te zwak |
| Ultimate Conductor Tyranno | Legendary-kaarten | Legendary | faro: te zwak · sam: klopt |
| Ancient Gear Golem | Secret Rare grensgevallen | Secret Rare | faro: te zwak · sam: klopt |
| Common Charity | Secret Rare grensgevallen | Secret Rare | faro: te zwak · sam: klopt |
| Darklord Desire | Secret Rare grensgevallen | Ultra Rare | faro: te zwak · sam: te sterk |
| Diabolos, King of the Abyss | Secret Rare grensgevallen | Ultra Rare | faro: te zwak · sam: klopt |
| Doom Dozer | Secret Rare grensgevallen | Ultra Rare | faro: te zwak · sam: klopt |
| Fairy Knight Ingunar | Secret Rare grensgevallen | Ultra Rare | faro: te zwak · sam: klopt |
| Gladiator Beast Darius | Secret Rare grensgevallen | Secret Rare | faro: te zwak · sam: klopt |
| Ice Beast Zerofyne | Secret Rare grensgevallen | Secret Rare | faro: te zwak · sam: klopt |
| Malefic Stardust Dragon | Secret Rare grensgevallen | Ultra Rare | faro: te zwak · sam: klopt |
| Meklord Astro Mekanikle | Secret Rare grensgevallen | Secret Rare | faro: te zwak · sam: klopt |
| Mobius the Mega Monarch | Secret Rare grensgevallen | Ultra Rare | faro: te zwak · sam: te sterk |
| Number 69: Heraldry Crest | Secret Rare grensgevallen | Secret Rare | faro: te zwak · sam: klopt |
| Number 92: Heart-eartH Dragon | Secret Rare grensgevallen | Ultra Rare | faro: te zwak · sam: te sterk |
| Poseidra, the Atlantean Dragon | Secret Rare grensgevallen | Secret Rare | faro: te zwak · sam: klopt |
| Superheavy Samurai Soulbang Cannon | Secret Rare grensgevallen | Ultra Rare | faro: te sterk · sam: klopt |
| The Gates of Dark World | Secret Rare grensgevallen | Ultra Rare | faro: te zwak · sam: klopt |
| Tytannial, Princess of Camellias | Secret Rare grensgevallen | Secret Rare | faro: te zwak · sam: klopt |
| Vehicroid Connection Zone | Secret Rare grensgevallen | Secret Rare | faro: te zwak · sam: klopt |

## Alle veranderingen per lijst

"Stemmen" laat zien wie wat stemde. **\*** = jouw oude stem van de stempagina.

### Voorstel: verboden

38 kaarten, 34 veranderd, 4 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Anti-Spell Fragrance | Verboden | **Toegestaan als Ultra Rare** (max 1 per deck) | faro: toestaan (Super Rare) · sam: toestaan (Ultra Rare) · bossg\*: toestaan (Ultra Rare) |
| Archlord Kristya | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Ultra Rare) · bossg\*: toestaan (Secret Rare) |
| Barrier Statue of the Abyss | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Super Rare) · bossg\*: toestaan (Secret Rare) |
| Barrier Statue of the Drought | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Super Rare) · bossg\*: toestaan (Secret Rare) |
| Barrier Statue of the Heavens | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Super Rare) · bossg\*: toestaan (Secret Rare) |
| Barrier Statue of the Inferno | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Super Rare) · bossg\*: toestaan (Secret Rare) |
| Barrier Statue of the Stormwinds | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Super Rare) · bossg\*: toestaan (Secret Rare) |
| Barrier Statue of the Torrent | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Super Rare) · bossg\*: toestaan (Secret Rare) |
| Cannon Soldier | Verboden | **Toegestaan als Rare** (max 1 per deck) | faro: toestaan (Normal) · sam: toestaan (Rare) |
| Cannon Soldier MK-2 | Verboden | **Toegestaan als Rare** (max 1 per deck) | faro: toestaan (Normal) · sam: toestaan (Rare) |
| Chain Material | Verboden | **Toegestaan als Ultra Rare** (max 1 per deck) | faro: toestaan (Normal) · sam: toestaan (Ultra Rare) |
| Evilswarm Ophion | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Normal) · sam: toestaan (Ultra Rare) · bossg\*: toestaan (Secret Rare) |
| Fossil Dyna Pachycephalo | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Secret Rare) · sam: buiten houden · bossg\*: toestaan (Ultra Rare) |
| Gozen Match | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Secret Rare) · bossg\*: toestaan (Secret Rare) |
| Gravity Bind | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Super Rare) · sam: toestaan (Secret Rare) |
| Imperial Order | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Secret Rare) · bossg: toestaan (Ultra Rare) |
| Level Limit - Area B | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Secret Rare) |
| Magical Explosion | Verboden | **Toegestaan als Rare** (max 1 per deck) | faro: toestaan (Normal) · sam: toestaan (Rare) |
| Majesty's Fiend | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Ultra Rare) · sam: toestaan (Secret Rare) · bossg\*: toestaan (Secret Rare) |
| Mask of Restrict | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Secret Rare) |
| Messenger of Peace | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Super Rare) · sam: toestaan (Secret Rare) |
| Mistake | Verboden | **Toegestaan als Ultra Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Ultra Rare) · bossg\*: toestaan (Ultra Rare) |
| Non-Fusion Area | Verboden | **Toegestaan als Ultra Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Ultra Rare) · bossg\*: toestaan (Ultra Rare) |
| Red Screen | Verboden | **Toegestaan als Ultra Rare** (max 1 per deck) | faro: toestaan (Normal) · sam: toestaan (Ultra Rare) |
| Rivalry of Warlords | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Secret Rare) · bossg\*: toestaan (Secret Rare) |
| Royal Decree | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Super Rare) · sam: toestaan (Secret Rare) · bossg: toestaan (Secret Rare) |
| Royal Oppression | Verboden | **Toegestaan als Ultra Rare** (max 1 per deck) | faro: toestaan (Secret Rare) · sam: toestaan (Ultra Rare) · bossg: toestaan (Ultra Rare) |
| Summon Limit | Verboden | **Toegestaan als Ultra Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Super Rare) · bossg\*: toestaan (Ultra Rare) |
| Time Seal | Verboden | **Toegestaan als Super Rare** (max 1 per deck) | faro: toestaan (Normal) · sam: toestaan (Rare) · bossg: toestaan (Super Rare) |
| Vanity's Emptiness | Verboden | **Toegestaan als Ultra Rare** (max 1 per deck) | faro: toestaan (Ultra Rare) · sam: toestaan (Ultra Rare) · bossg: toestaan (Ultra Rare) |
| Vanity's Fiend | Verboden | **Toegestaan als Ultra Rare** (max 1 per deck) | faro: toestaan (Rare) · sam: toestaan (Ultra Rare) · bossg: toestaan (Ultra Rare) |
| Vanity's Ruler | Verboden | **Toegestaan als Ultra Rare** (max 1 per deck) | faro: toestaan (Ultra Rare) · sam: toestaan (Super Rare) · bossg\*: buiten houden |
| Wall of Revealing Light | Verboden | **Toegestaan als Secret Rare** (max 1 per deck) | faro: toestaan (Ultra Rare) · sam: toestaan (Secret Rare) |
| Wind-Up Magician | Verboden | **Toegestaan als Super Rare** (max 1 per deck) | faro: toestaan (Normal) · sam: toestaan (Super Rare) |

### Voorstel: max 1 per deck

10 kaarten, 1 veranderd, 9 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Mind Drain | Max 1 per deck | **3 per deck** | faro: te zwak · sam: klopt · bossg\*: te zwak |

### Voorstel: Legendary bord-wipes

13 kaarten, 2 veranderd, 11 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Evilswarm Exciton Knight | Legendary | **Verboden** | faro: klopt · sam: te sterk · bossg\*: te sterk |
| Giant Trunade | Legendary | **Secret Rare** (max 1 per deck) | faro: klopt · sam: te zwak · bossg\*: te zwak |

### Legendary-kaarten

32 kaarten, 22 veranderd, 10 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Ancient City - Rainbow Ruins | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Arcana Force EX - The Light Ruler | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak · bossg\*: klopt |
| Assault Revival | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Darkness Neosphere | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Exodia Necross | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Gemini Imps | Legendary | **Secret Rare** | faro: te zwak · sam: klopt · bossg\*: te zwak |
| Gishki Emilia | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Great Dezard | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Horus the Black Flame Dragon LV8 | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak · bossg\*: te zwak |
| Kinka-byo | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Meklord Emperor Wisel | Legendary | **Verboden** | faro: te zwak · sam: te sterk · bossg\*: te sterk |
| Moon Dance Ritual | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Rebound | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak · bossg\*: te zwak |
| Retort | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Sky Scourge Invicil | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Slacker Magician | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Sophia, Goddess of Rebirth | Legendary | **Verboden** | faro: te sterk · sam: te zwak · bossg\*: te sterk |
| Strike of the Monarchs | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak · bossg\*: te zwak |
| The Monarchs Erupt | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| The Resolute Meklord Army | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| Volcanic Doomfire | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |
| White Night Dragon | Legendary | **Secret Rare** | faro: te zwak · sam: te zwak |

### Secret Rare grensgevallen

44 kaarten, 18 veranderd, 26 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Aqua Armor Ninja | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| Blackboost | Ultra Rare | **Super Rare** | sam: te zwak |
| Blue-Eyes Shining Dragon | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| Dark Eradicator Warlock | Ultra Rare | **Super Rare** | sam: te zwak |
| Frost and Flame Dragon | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| Gladiator Beast Octavius | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| Gravekeeper's Shaman | Ultra Rare | **Super Rare** | sam: te zwak |
| Naturia Forest | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| Night Express Knight | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| Paradox Fusion | Ultra Rare | **Super Rare** | sam: te zwak |
| Psi-Impulse | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| Reverse Breaker | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| Silent Insect | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| Silent Magician LV8 | Ultra Rare | **Super Rare** | sam: te zwak |
| Starlight Road | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| Superheavy Samurai Soulbreaker Armor | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| White Dragon Ninja | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |
| World of Prophecy | Secret Rare | **Ultra Rare** | faro: te zwak · sam: te zwak |

### Ancient Gear (Boss Route-lijst)

14 kaarten, 11 veranderd, 3 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Ancient Gear Beast | Ultra Rare | **Super Rare** | sam: te zwak |
| Ancient Gear Box | Super Rare | **Rare** | sam: te zwak |
| Ancient Gear Engineer | Secret Rare | **Ultra Rare** | sam: te zwak |
| Ancient Gear Gadjiltron Chimera | Super Rare | **Rare** | sam: te zwak |
| Ancient Gear Gadjiltron Dragon | Secret Rare | **Ultra Rare** | sam: te zwak |
| Ancient Gear Knight | Ultra Rare | **Super Rare** | sam: te zwak |
| Ancient Gear Soldier | Ultra Rare | **Super Rare** | sam: te zwak |
| Limiter Removal | Ultra Rare | **Secret Rare** | sam: te sterk |
| Overload Fusion | Rare | **Super Rare** | sam: te sterk |
| Spell Gear | Ultra Rare | **Secret Rare** | sam: te sterk |
| United We Stand | Rare | **Super Rare** | sam: te sterk |

### Blue-Eyes (Boss Route-lijst)

14 kaarten, 5 veranderd, 9 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Bingo Machine, Go!!! | Normal | **Rare** | sam: te sterk |
| Dragon's Mirror | Rare | **Super Rare** | sam: te sterk |
| Kaibaman | Normal | **Rare** | sam: te sterk |
| Return of the Dragon Lords | Rare | **Super Rare** | sam: te sterk |
| Silver's Cry | Rare | **Super Rare** | sam: te sterk |

### Chaos / Black Luster Soldier (Boss Route-lijst)

14 kaarten, 8 veranderd, 6 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Chaos Command Magician | Ultra Rare | **Super Rare** | sam: te zwak |
| Chaos Sorcerer | Ultra Rare | **Secret Rare** | sam: te sterk |
| D.D. Assailant | Ultra Rare | **Super Rare** | sam: te zwak |
| D.D. Esper Star Sparrow | Secret Rare | **Ultra Rare** | sam: te zwak |
| D.D. Unicorn Knight | Ultra Rare | **Super Rare** | sam: te zwak |
| D.D. Warrior | Ultra Rare | **Super Rare** | sam: te zwak |
| D.D. Warrior Lady | Ultra Rare | **Super Rare** | sam: te zwak |
| Koa'ki Meiru Doom | Ultra Rare | **Super Rare** | sam: te zwak |

### Chazz / Armed Dragon / Ojama (Boss Route-lijst)

15 kaarten, 6 veranderd, 9 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Armed Dragon LV3 | Rare | **Normal** | sam: te zwak |
| Armed Dragon LV7 | Secret Rare | **Ultra Rare** | sam: te zwak |
| Dark Armed Dragon | Secret Rare | **Ultra Rare** | sam: te zwak |
| Metaphys Armed Dragon | Super Rare | **Rare** | sam: te zwak |
| Ojama Blue | Rare | **Super Rare** | sam: te sterk |
| Ojamagic | Super Rare | **Rare** | sam: te zwak |

### Crystal Beast (Boss Route-lijst)

13 kaarten, 6 veranderd, 7 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Counter Gem | Ultra Rare | **Super Rare** | sam: te zwak |
| Crystal Beast Amethyst Cat | Super Rare | **Rare** | sam: te zwak |
| Crystal Beast Ruby Carbuncle | Super Rare | **Rare** | sam: te zwak |
| Crystal Beast Topaz Tiger | Super Rare | **Rare** | sam: te zwak |
| Rare Value | Super Rare | **Rare** | sam: te zwak |
| Spell Shattering Arrow | Ultra Rare | **Super Rare** | sam: te zwak |

### Cubic (Boss Route-lijst)

15 kaarten, 10 veranderd, 5 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Breath of Light | Ultra Rare | **Super Rare** | sam: te zwak |
| Gate Blocker | Ultra Rare | **Super Rare** | sam: te zwak |
| Gigastone Omega | Ultra Rare | **Secret Rare** | sam: te sterk |
| Koa'ki Meiru Guardian | Ultra Rare | **Super Rare** | sam: te zwak |
| Koa'ki Meiru Sandman | Secret Rare | **Ultra Rare** | sam: te zwak |
| Koa'ki Meiru Wall | Secret Rare | **Ultra Rare** | sam: te zwak |
| Medium Piece Golem | Ultra Rare | **Super Rare** | sam: te zwak |
| Number 106: Giant Hand | Ultra Rare | **Secret Rare** | sam: te sterk |
| Number C106: Giant Red Hand | Ultra Rare | **Secret Rare** | sam: te sterk |
| Small Piece Golem | Ultra Rare | **Super Rare** | sam: te zwak |

### Cyber Dragon (Boss Route-lijst)

15 kaarten, 5 veranderd, 10 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Cyber Dragon | Super Rare | **Ultra Rare** | sam: te sterk |
| Cyber Dragon Nova | Super Rare | **Ultra Rare** | sam: te sterk |
| Cyber Phoenix | Ultra Rare | **Super Rare** | sam: te zwak |
| Cyber Valley | Ultra Rare | **Super Rare** | sam: te zwak |
| Evolution Burst | Ultra Rare | **Super Rare** | sam: te zwak |

### Dark Magician / Magician Girl (Boss Route-lijst)

12 kaarten, 6 veranderd, 6 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Apprentice Magician | Super Rare | **Rare** | sam: te zwak |
| Dark Magic Attack | Ultra Rare | **Secret Rare** | sam: te sterk |
| Dark Magician Knight | Secret Rare | **Ultra Rare** | sam: te zwak |
| Magical Dimension | Ultra Rare | **Secret Rare** | sam: te sterk |
| Milla the Temporal Magician | Ultra Rare | **Super Rare** | sam: te zwak |
| Thousand Knives | Ultra Rare | **Super Rare** | sam: te zwak |

### Destiny HERO (Boss Route-lijst)

15 kaarten, 10 veranderd, 5 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Cyclone Blade | Ultra Rare | **Super Rare** | sam: te zwak |
| D - Formation | Rare | **Normal** | sam: te zwak |
| D - Fortune | Ultra Rare | **Super Rare** | sam: te zwak |
| D-Fusion | Rare | **Super Rare** | sam: te sterk |
| Destiny Draw | Super Rare | **Rare** | sam: te zwak |
| Destiny HERO - Departed | Ultra Rare | **Super Rare** | sam: te zwak |
| Destiny HERO - Doom Lord | Ultra Rare | **Super Rare** | sam: te zwak |
| Destiny HERO - Double Dude | Ultra Rare | **Super Rare** | sam: te zwak |
| Destiny HERO - Dread Servant | Ultra Rare | **Super Rare** | sam: te zwak |
| Destiny HERO - Dreadmaster | Ultra Rare | **Super Rare** | sam: te zwak |

### Dinosaur (Boss Route-lijst)

14 kaarten, 7 veranderd, 7 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Element Saurus | Ultra Rare | **Super Rare** | sam: te zwak |
| Evilswarm Salamandra | Ultra Rare | **Super Rare** | sam: te zwak |
| Fossil Excavation | Ultra Rare | **Super Rare** | sam: te zwak |
| Hyper Hammerhead | Ultra Rare | **Super Rare** | sam: te zwak |
| Jurrac Titano | Secret Rare | **Ultra Rare** | sam: te zwak |
| Super-Ancient Dinobeast | Ultra Rare | **Super Rare** | sam: te zwak |
| Survival Instinct | Ultra Rare | **Super Rare** | sam: te zwak |

### Elemental HERO (Boss Route-lijst)

15 kaarten, 5 veranderd, 10 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Convert Contact | Ultra Rare | **Super Rare** | sam: te zwak |
| Elemental HERO Bubbleman | Ultra Rare | **Super Rare** | sam: te zwak |
| Elemental HERO Poison Rose | Ultra Rare | **Super Rare** | sam: te zwak |
| Feather Wind | Ultra Rare | **Super Rare** | sam: te zwak |
| Neos Force | Ultra Rare | **Super Rare** | sam: te zwak |

### Galaxy / Photon (Boss Route-lijst)

14 kaarten, 6 veranderd, 8 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Galaxy Dragon | Ultra Rare | **Super Rare** | sam: te zwak |
| Galaxy Storm | Ultra Rare | **Super Rare** | sam: te zwak |
| Kuriphoton | Ultra Rare | **Super Rare** | sam: te zwak |
| Photon Leo | Ultra Rare | **Super Rare** | sam: te zwak |
| Photon Pirate | Ultra Rare | **Super Rare** | sam: te zwak |
| Superdimensional Robot Galaxy Destroyer | Secret Rare | **Ultra Rare** | sam: te zwak |

### Harpie (Boss Route-lijst)

14 kaarten, 5 veranderd, 9 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Gryphon Wing | Secret Rare | **Ultra Rare** | sam: te zwak |
| Harpie Dancer | Super Rare | **Rare** | sam: te zwak |
| Harpie Lady 2 | Ultra Rare | **Super Rare** | sam: te zwak |
| Harpie Lady Sisters | Rare | **Normal** | sam: te zwak |
| Harpie Queen | Rare | **Super Rare** | sam: te sterk |

### Jinzo (Boss Route-lijst)

14 kaarten, 6 veranderd, 8 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Amplifier | Ultra Rare | **Super Rare** | sam: te zwak |
| Fiend Comedian | Normal | **Rare** | sam: te sterk |
| Fiend's Sanctuary | Rare | **Super Rare** | sam: te sterk |
| Fissure | Rare | **Super Rare** | sam: te sterk |
| Metalmorph | Normal | **Rare** | sam: te sterk |
| Raigeki Break | Normal | **Rare** | sam: te sterk |

### Legendary Fisherman (Boss Route-lijst)

13 kaarten, 7 veranderd, 6 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Armed Sea Hunter | Secret Rare | **Ultra Rare** | sam: te zwak |
| Eternal Drought | Ultra Rare | **Super Rare** | sam: te zwak |
| Fishborg Archer | Secret Rare | **Ultra Rare** | sam: te zwak |
| Fishborg Doctor | Ultra Rare | **Super Rare** | sam: te zwak |
| Fishborg Launcher | Ultra Rare | **Super Rare** | sam: te zwak |
| Gladiator Beast Murmillo | Ultra Rare | **Super Rare** | sam: te zwak |
| Tri-Edge Levia | Ultra Rare | **Super Rare** | sam: te zwak |

### Machina (Boss Route-lijst)

12 kaarten, 9 veranderd, 3 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Acid Rain | Ultra Rare | **Super Rare** | sam: te zwak |
| Black Salvo | Ultra Rare | **Super Rare** | sam: te zwak |
| Delta Tri | Ultra Rare | **Super Rare** | sam: te zwak |
| Geargiagear Gigant XG | Secret Rare | **Ultra Rare** | sam: te zwak |
| Gravity Blaster | Ultra Rare | **Super Rare** | sam: te zwak |
| Iron Call | Ultra Rare | **Super Rare** | sam: te zwak |
| Mecha Phantom Beast Aerosguin | Ultra Rare | **Super Rare** | sam: te zwak |
| Mecha Phantom Beast Coltwing | Ultra Rare | **Super Rare** | sam: te zwak |
| System Down | Ultra Rare | **Super Rare** | sam: te zwak |

### Red-Eyes (Boss Route-lijst)

12 kaarten, 10 veranderd, 2 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Burial from a Different Dimension | Ultra Rare | **Super Rare** | sam: te zwak |
| Call of the Haunted | Normal | **Rare** | sam: te sterk |
| Enemy Controller | Normal | **Rare** | sam: te sterk |
| Masked Dragon | Rare | **Normal** | sam: te zwak |
| Molten Destruction | Rare | **Super Rare** | sam: te sterk |
| Red-Eyes Darkness Dragon | Ultra Rare | **Super Rare** | sam: te zwak |
| Red-Eyes Darkness Metal Dragon | Ultra Rare | **Secret Rare** | sam: te sterk |
| Red-Eyes Wyvern | Normal | **Rare** | sam: te sterk |
| Red-Eyes Zombie Dragon | Rare | **Super Rare** | sam: te sterk |
| The Cheerful Coffin | Rare | **Normal** | sam: te zwak |

### Toon (Boss Route-lijst)

12 kaarten, 6 veranderd, 6 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Book of Moon | Ultra Rare | **Super Rare** | sam: te zwak |
| Parrot Dragon | Rare | **Normal** | sam: te zwak |
| Toon Gemini Elf | Normal | **Rare** | sam: te sterk |
| Toon Goblin Attack Force | Super Rare | **Rare** | sam: te zwak |
| Toon Masked Sorcerer | Ultra Rare | **Super Rare** | sam: te zwak |
| Toon Mermaid | Super Rare | **Rare** | sam: te zwak |

### Vampire (Boss Route-lijst)

12 kaarten, 6 veranderd, 6 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Book of Life | Rare | **Super Rare** | sam: te sterk |
| Crimson Knight Vampire Bram | Super Rare | **Ultra Rare** | sam: te sterk |
| Vampire Dragon | Super Rare | **Rare** | sam: te zwak |
| Vampire Hunter | Rare | **Super Rare** | sam: te sterk |
| Vampire Lady | Rare | **Super Rare** | sam: te sterk |
| Vampire Vamp | Rare | **Super Rare** | sam: te sterk |

### Zombie (Boss Route-lijst)

13 kaarten, 11 veranderd, 2 blijven zoals voorgesteld.

| Kaart | Voorstel | Uitslag | Stemmen |
|---|---|---|---|
| Bone Crusher | Ultra Rare | **Super Rare** | sam: te zwak |
| Fushioh Richie | Secret Rare | **Ultra Rare** | sam: te zwak |
| Il Blud | Ultra Rare | **Super Rare** | sam: te zwak |
| Kasha | Ultra Rare | **Super Rare** | sam: te zwak |
| King of the Skull Servants | Ultra Rare | **Super Rare** | sam: te zwak |
| Necroface | Ultra Rare | **Super Rare** | sam: te zwak |
| Number 22: Zombiestein | Secret Rare | **Ultra Rare** | sam: te zwak |
| Shutendoji | Secret Rare | **Ultra Rare** | sam: te zwak |
| Tutan Mask | Ultra Rare | **Super Rare** | sam: te zwak |
| Vampire Genesis | Ultra Rare | **Super Rare** | sam: te zwak |
| Zombowwow | Ultra Rare | **Super Rare** | sam: te zwak |

