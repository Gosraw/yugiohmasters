# Duelist Circle — Valuation Engine v2: fix na jouw review
## Vervolg op de Season 1 reset-run, uitsluitend gericht op het waarderingsmodel

Je instructie was helder: NIET verder met rarity-tuning, NIET schrijven naar de
database, NIET resetten, NIET pushen — eerst het waarderingsmodel zelf
repareren, en aan het eind eerlijk zeggen of het veilig genoeg is. Dat is
precies wat hieronder staat, inclusief het eindoordeel.

Alle regels hieronder gelden nog steeds: er is niets naar productie
geschreven, `game_rarity` is niet aangeraakt, er is geen `--write-scores`
uitgevoerd, er is niet gereset, het format is niet geactiveerd, en er is
niet gepusht.

---

## 1. Wat er is gevonden — met écht bewijs, niet gegokt

Tijdens het onderzoeken van je voorbeelden vond ik iets belangrijks dat ik niet
verwachtte: er stond al een **echt auditrapport** op je schijf
(`reports/card-valuation/2026-08-23T15-24-06-485Z/`, 13.931 kaarten — je hele
catalogus). Dat is vrijwel zeker de run die jouw voorbeelden heeft opgeleverd.
Dat rapport heb ik gelezen (niet aangepast, niet verwijderd — het staat er nog,
zie sectie 8) en het bevestigt je bevindingen letterlijk, met de exacte
motivatie die de oude engine gaf:

- **Baronne de Fleur** — oude score: dependency 6,5, reden: `"only functional
  with the \"Fleur\" archetype"`. Root cause, nu écht gevonden: Baronne heeft
  een "once per turn"-clausule die haar eigen volledige naam citeert
  (`"Baronne de Fleur"`). Die naam *bevat* het woord "Fleur" — haar
  archetype-tag. De oude check keek alleen of het archetype-woord ergens in de
  eigen kaarttekst voorkwam, zonder onderscheid te maken tussen "dit is een
  eis" en "dit is gewoon de kaart die zichzelf citeert". Haar Fusion
  Materials zijn juist volledig generiek ("1 Fusion, Synchro, or Xyz Monster,
  plus 1 non-Tuner monster") — geen naam, geen archetype-eis.
- **Forbidden Droplet** — oude score: dependency 5,5, reden: `"only
  functional with the \"Forbidden\" archetype"`, plús een tweede, nog
  onbekende fout: hij werd óók onterecht als "restricts what the opponent can
  do" (een floodgate) gelabeld. Zelfde mechanisme als Baronne — waarschijnlijk
  weer een zelfverwijzing naar zijn eigen naam.
- **Op catalogus-schaal**: 3.555 van de 13.931 kaarten (25,5%) kregen deze
  "only functional with the X archetype"-vlag van de oude engine. Belangrijk
  om eerlijk te zijn: dat zijn **niet allemaal fouten** — veel daarvan zijn
  écht archetype-gebonden kaarten (bijv. Madolche Promenade, Boot Sector
  Launch) waar de vlag terecht is. Hoeveel van die 3.555 hetzelfde
  zelfverwijzings-mankement hebben als Baronne, kan ik niet exact zeggen
  zonder de nieuwe engine tegen de echte catalogus te draaien (zie sectie 5) —
  dat oude rapport bevat alleen de uitkomst-scores, niet de ruwe kaarttekst,
  dus ik kon de nieuwe engine er niet opnieuw overheen draaien.

Daarnaast, gewoon door de code regel voor regel te lezen (niet gegokt), vond
ik nog een bug die niets met archetypes te maken had: **"negate the attack"**
(bijv. Negate Attack, Draining Shield) kreeg exact dezelfde power-bonus als
**"negate the activation/effect"** (een universele, veel sterkere negate) —
dat is de directe oorzaak van het "alles convergeert naar dezelfde score"-
probleem dat je noemde bij Draining Shield / Negate Attack / Scrap-Iron
Scarecrow.

---

## 2. Wat er is herbouwd

`lib/valuation-engine.mjs` is herschreven (versie `2026-08-23.2`). De kern:

- **Dependency komt nooit meer uit een archetype-tag-match.** Elke
  aanhalingsteken-referentie in de kaarttekst wordt nu geclassificeerd als:
  verplichte eis om te summonen/activeren, verplicht fusiemateriaal,
  verplicht doelwit, optionele bonus, zoekdoel, alternatief-effect, óf
  zelfverwijzing (de kaart citeert gewoon zijn eigen naam — geen straf). De
  archetype-tag wordt alleen nog gebruikt om uit te *leggen* of hij
  functioneel relevant is, nooit om automatisch te straffen.
- **Extra Deck-materialen** worden nu apart geclassificeerd: generiek (geen
  naam/attribuut/type-eis — Baronne), beperkt (attribuut/type/Tuner-eis, geen
  naam), of genoemd (een specifieke kaart vereist — bijv. Red-Eyes Dark
  Dragoon's "1 'Red-Eyes' monster").
- **Acht in plaats van zes scores**, precies zoals gevraagd: Power,
  Accessibility, Dependency, Generic Utility, Consistency, **Floor**
  (gegarandeerde waarde zonder enige synergie), **Ceiling** (beste-geval-
  waarde met volledige support), en Oppressiveness. Archetype-payoffs mogen nu
  expliciet een hoge Ceiling hebben ondanks hoge Dependency — dependency
  straft de Draft Value, niet hoe goed de kaart in de juiste deck kán zijn.
- **Oppressiveness is volledig losgekoppeld van Draft Value.** Een kaart kan
  tegelijk erg begeerlijk (hoge rarity) én ongeschikt voor Season 1 (hoge
  oppressiveness, apart afgehandeld via `release_stage`) zijn — dat waren in
  de oude engine met elkaar vermengd.
- Vijf kleinere, eveneens bevestigde bugs gefixt: de "negate attack vs negate
  effect"-verwarring hierboven, een Tuner/non-Tuner regex-fout, "effects...are
  negated" die "have their effects negated" miste (Dark Ruler No More), een
  zoek-detectie die graveyard-recursie (Magician of Faith) helemaal niet zag,
  en een zelfbeperking ("cannot be Special Summoned by other ways") die
  onterecht als een floodgate tegen de tegenstander werd gelezen — dat laatste
  raakt vermoedelijk de meeste Extra Deck-monsters met een summon-eis.

---

## 3. Regressietest — écht uitgevoerd, niet aangenomen

`lib/valuation-engine.regression.test.mjs` (nieuw, plain `node:assert`
harness — vitest werkt nog steeds niet via de device-bridge) test alle 12
gevraagde kaarten. **18/18 asserties slagen** — en dat is twee keer
daadwerkelijk gedraaid: eerst in de cloud-sandbox, daarna nogmaals rechtstreeks
op jouw Mac via de device-bridge (Node v22.23.2), met hetzelfde resultaat.

Onderweg faalden er eerst 8 van de 18 (zie de sessiegeschiedenis) — dat waren
allemaal echte bugs (waaronder de vijf hierboven), niet foutieve tests. Elke
fix is opnieuw getest voor ik verderging.

Bevestigd, per kaart:
- Forbidden Droplet: **niet** archetype-afhankelijk (was het probleem).
- Baronne de Fleur: **niet** Fleur-afhankelijk (was het probleem), wel een
  breed inzetbare, generieke Fusion.
- Harpie's Feather Duster: zelfde test, ook archetype-tag "Harpie" zonder
  straf — landt terecht op Super Rare of hoger.
- Fuh-Rin-Ka-Zan: zware straf op accessibility/consistency/floor door de
  4-attributen-eis.
- Red-Eyes Dark Dragoon: genoemd fusiemateriaal geeft écht hoge dependency
  (duidelijk hoger dan Baronne's generieke materiaal), maar behoudt een hoge
  Ceiling.
- Blue-Eyes Ultimate Spirit Dragon: harde, genoemde summon-eis wordt correct
  als "mandatory_requirement" geclassificeerd — lage Floor, hoge Ceiling.
- De drie "negate"-kaarten convergeren niet meer naar identieke scores; Scrap-
  Iron Scarecrow's bruikbaarheid vanuit de Graveyard geeft het terecht een
  voordeel boven Negate Attack.
- Oppressiveness zit aantoonbaar (met de formule teruggerekend) nooit in Draft
  Value.

Let op — eerlijkheid over de kaarttekst zelf: dit sandbox-environment heeft
geen netwerktoegang, dus ik kon de exacte officiële kaarttekst niet
verifiëren. De fixtures zijn geschreven op basis van mijn beste herinnering
van deze bekende, veelbesproken kaarten, met per kaart een vertrouwens-niveau
in de code-comments. Noctovision Dragon is expliciet gemarkeerd als een
synthetische, representatieve fixture omdat ik de echte tekst niet met
voldoende zekerheid kon reproduceren. De asserties testen — zoals gevraagd —
betekenisvolle feiten (is dit wel/niet archetype-afhankelijk, is de Ceiling
wel/niet behouden), geen exacte score-getallen.

---

## 4. Rapportage-tooling bijgewerkt

`scripts/audit-card-valuation.mjs` is herschreven voor het nieuwe model:

- Alle acht scores in CSV/JSON.
- **Nieuw**: een sectie "FALSE-POSITIVE ARCHETYPE DEPENDENCY REVIEW" — elke
  kaart met een archetype-tag die de engine als puur thematisch beoordeelt
  (geen echte eis gevonden). Precies waar Forbidden Droplet en Baronne de
  Fleur in zouden moeten staan zodra dit tegen je echte catalogus draait.
- **Nieuw**: een "FALSE-NEGATIVE"-sectie — kaarten zónder archetype-tag maar
  met wél gevonden afhankelijkheid, zodat je kunt zien of de database-tagging
  zelf iets mist.
- **Nieuw**: een sectie met dubbelzinnige referenties die de classifier niet
  zeker kon plaatsen — bewust zwak gestraft in plaats van geraden.
- **Nieuw**: 50 gelijkmatig verspreide voorbeeldkaarten per voorgestelde
  rarity, niet alleen de uitschieters.
- Top-upgrades/downgrades nu tot 100 rijen in het rapport zelf (was 60).

`scripts/simulate-draft-value.mjs` is uitgebreid met: mediaan/p10/p90 per
rarity, overlap tussen aangrenzende tiers, percentage 3-kaart-aanbiedingen
waar alle drie de keuzes laagwaardig zijn, en percentage Ultra Rare+
aanbiedingen zonder één sterke praktische keuze. Werkelijk gedraaid tegen de
ingebouwde fixture (20.000 rondes): gemiddelde waarde stijgt monotoon met
rarity (JA), 0% overlap tussen de tiers die gevuld waren.

Een nieuwe, additieve migratie (`202608231600_valuation_engine_v2_columns.sql`)
voegt de vier nieuwe kolommen toe (`accessibility_score`,
`generic_utility_score`, `floor_score`, `ceiling_score`) en markeert de oude
`usability_score`/`versatility_score` als vervangen zonder ze te verwijderen.
**Deze migratie is alleen gelezen/gecontroleerd, niet tegen een echte database
gedraaid** — geen netwerktoegang in deze sandbox, zoals de hele sessie al
gold.

---

## 5. Wat NIET kon worden gedaan — eerlijk, geen mooi weer spelen

Je vroeg expliciet om de engine tegen alle 13.931 echte kaarten te draaien:
verdeling, top 100 upgrades/downgrades, 50 samples per rarity, oppressiveness-
review. **Dat kon in deze sandbox niet** — er is geen netwerktoegang en dus
geen verbinding met je echte Supabase-project, exact dezelfde beperking die
al de hele sessie gold. Het bestaande rapport op je schijf bevat alleen de
UITKOMST van de oude, foutieve engine — geen ruwe kaarttekst — dus ik kon de
nieuwe engine er niet overheen laten draaien om meteen echte cijfers te
krijgen.

In plaats daarvan heb ik een 23-kaarts synthetische steekproef gebouwd (géén
echte catalogus, expliciet zo gelabeld) om te controleren dat het mechanisme
niet ontspoort: de verdeling raakte 4 van de 6 rarity-banden, bereikte Ultra
Rare met een bewust sterke testkaart, en archetype-payoffs kregen terecht een
lage Floor met een behouden hoge Ceiling. Dat bewijst dat het model niet
degenereert — het bewijst niet wat de echte verdeling wordt.

---

## 6. Git — alles lokaal, niets gepusht

Eén nieuwe commit deze ronde, bovenop de 11 van de vorige ronde (12 totaal,
allemaal nog steeds alleen lokaal — `git log origin/main..HEAD` bevestigt
dit):

```
4f9cf51 fix(valuation): rebuild engine to classify dependency from card text, not archetype tags
```

Bestanden: `lib/valuation-engine.mjs`, `lib/valuation-engine.d.mts`,
`lib/valuation-engine.regression.test.mjs` (nieuw),
`scripts/audit-card-valuation.mjs`, `scripts/simulate-draft-value.mjs`,
`supabase/migrations/202608231600_valuation_engine_v2_columns.sql` (nieuw),
`docs/SEASON_1.md`, `CLAUDE.md`, `.gitignore` (toegevoegd: `reports/` — het
echte auditrapport van 13.931 kaarten bleef als ongetrackt bestand op je
schijf staan; ik heb het niet verwijderd, alleen niet in git opgenomen omdat
het een gegenereerd, potentieel zwaar bestand is, geen broncode).

`npm run lint` en `npm run typecheck`: **beide schoon, 0 problemen** — echt
gedraaid op je Mac via de device-bridge, niet aangenomen.

---

## 7. Mijn oordeel — zoals je vroeg

**Nog niet vrijgeven voor toepassing op de echte catalogus.**

Niet omdat ik nog een concrete, aanwijsbare denkfout in de logica heb
gevonden die niet is opgelost — elke specifieke fout die je aandroeg is
gevonden, bevestigd (met echt bewijs uit je eigen rapport, niet gegokt), en
gefixt, en de regressietest bevestigt dat op alle 12 kaarten, twee keer
uitgevoerd. In die zin: geen bekende semantische fout meer over.

Maar dat is niet hetzelfde als "veilig om toe te passen". Punt 9 en 10 van je
instructie — de engine tegen alle 13.931 echte kaarten draaien en de
verdeling/steekproeven/simulatie daadwerkelijk bekijken — kon in deze sandbox
niet gebeuren, en dat was precies de stap die de eerste keer de echte fouten
aan het licht bracht. Een rule-based systeem zoals dit kan, hoe goed getest
ook op de bekende gevallen, altijd nieuwe randgevallen missen ergens in
13.931 kaarten die de regressietest niet dekt — dat is ook precies waarom
`REPORT.md` nu een sectie met "ambiguous references" heeft: eerlijk erkennen
wat de classifier niet zeker weet, in plaats van te doen alsof.

**Concreet advies**: run zelf `node scripts/audit-card-valuation.mjs` tegen je
echte catalogus (Phase C in de runbook, ongewijzigd — dit schrijft nog steeds
niets weg zonder `--write-scores`). Bekijk specifiek de nieuwe "FALSE-POSITIVE
ARCHETYPE DEPENDENCY"-sectie — als daar geen Forbidden Droplet/Baronne-achtige
missers meer in staan, en de 50-per-rarity-steekproeven er redelijk uitzien,
dan is dat het moment om verder te gaan naar rarity-tuning. Tot die run is
gedaan, zou ik zelf niet verder gaan dan dat.

---

## Openstaande beslissingen (ongewijzigd t.o.v. het vorige rapport)

Nog steeds jouw goedkeuring nodig, in deze volgorde: (1) de echte
catalogus-audit draaien en dit nieuwe rapport-gedeelte beoordelen, (2) pas
daarna rarity-tuning/`--write-scores`, (3) de format activeren, (4) de echte
reset uitvoeren, (5) pushen/deployen. Niets daarvan is deze ronde uitgevoerd.
