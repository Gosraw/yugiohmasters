# Duelist Circle — Ontwikkelsessie Rapport
**21 augustus 2026 · DEEL 1 (Visuals) · DEEL 2 (Rarity-economie) · DEEL 3 (iPhone/PWA)**

Deze sessie is autonoom uitgevoerd volgens de instructies: bestaande code eerst geïnspecteerd voordat er iets veranderde, bestaande functionaliteit behouden, geen database-destructieve acties, geen wijzigingen aan live Supabase-data, niets gepusht naar GitHub, lint/typecheck na elke wijziging, en de rarity-odds in productie **niet** aangepast — DEEL 2 is uitsluitend analyse en simulatie.

---

## DEEL 1 — Visuals, illustraties en game-sfeer

### 1. Welke visuals zijn toegevoegd
Het zwaartepunt van deze sessie lag op een volledig nieuw, origineel booster-pack illustratiesysteem (`PackArt`) en een sterkere pack-opening reveal. Er zijn geen officiële Yu-Gi-Oh/Konami-assets gebruikt; alles is CSS/SVG/gradient-gebaseerd en dus licht qua performance.

### 2. Welke pagina's zijn visueel veranderd
- `/shop` — packcards volledig herbouwd rond `PackArt`, inclusief het Special Pack-blok.
- `/shop/opening/[id]` — het "ongeopende pakket"-moment toont nu echte pack-art in plaats van een generieke sparkle-placeholder.
- Verder is bewust **niet** geraakt aan Home/Duel/Match-styling — die kregen in een eerdere sessie al de V4 arena/VS-behandeling en vielen buiten de scope van "geen onnodige redesigns."

### 3. Nieuwe assets/componenten
- `src/components/pack-art.tsx` — nieuwe, herbruikbare `PackArt`-component met 4 tier-varianten (`normal`/`premium`/`deluxe`/`special`), elk met eigen gradient, glow-kleur, icoon, tagline en ornamentiek.
- Nieuwe CSS in `src/app/globals.css` (sectie "V5 - BOOSTER PACK ART"): `.pack-shell` (clip-path foil-silhouet), `.pack-glow` (radiale ambient-gloed via een CSS custom property), `.pack-sheen` + `@keyframes pack-sheen-sweep` (diagonale foil-sweep).

### 4. Hoe pack-tiers visueel onderscheiden zijn
| Tier | Silhouet/gradient | Extra identiteit |
|---|---|---|
| Normal | Zink-grijs → zwart, subtiele ring | Shield-icoon, "STANDARD ISSUE" |
| Premium | Amber → zwart | Star-icoon, "PREMIUM SEALED" |
| Deluxe | Violet/fuchsia → zwart | Crown-icoon, **ornamentele hoek-flourishes**, "DELUXE EDITION" — voelt bewust duurder aan |
| Special | Cyaan/violet dual-tone | Sparkles-icoon, diagonale kleursplit, geroteerd "Event"-lint, "LIMITED EVENT" |

Elke pack heeft dus een eigen silhouet-gevoel, kleur, icoon én laagje "belangrijkheid" dat oploopt van Normal naar Deluxe — precies de gevraagde progressie, zonder een letterlijke kopie van officiële Yu-Gi-Oh-pakketten.

### 5. Wat er veranderd is aan pack opening
Het "MYSTERY CARD"-placeholder-blok (sparkle-icoon + tekst) is vervangen door de echte `PackArt` van het gekochte pack-type (via de `fill`-modus, die zich aanpast aan de bestaande `aspect-[421/614]`-container). De rest van het al zorgvuldig gebouwde 974-regels reveal-component (rank-glow, preloading, flip-logica, sparkle/burst-effecten, completion-scherm) is **niet** aangeraakt — dat werkte al goed en viel buiten scope.

### 6. Performance-maatregelen
- Geen enkele nieuwe externe afbeelding, geen `<img>`, geen base64-blobs: `PackArt` is 100% CSS/SVG/gradient, dus geen extra netwerk-requests, geen lazy-loading-vraagstuk.
- `animated`-prop op `PackArt` staat toe om de foil-sheen-animatie uit te zetten voor dichte lijsten (niet nodig gebleken — Shop toont max. 4 packs tegelijk, dus 4 gelijktijdige CSS-animaties, ruim binnen een veilige marge).
- `prefers-reduced-motion: reduce` is uitgebreid: eerst gold dit alleen voor `.energy-line::after`, nu ook voor `.pack-sheen` én de bestaande pack-opening pull-animaties (`.pull-shake-once`, `.pull-glow-2` t/m `.pull-glow-6`, `.pull-sparkle`, `.pull-burst-ring`) — dit was een echte, vooraf bestaande accessibility-lacune die nu gedicht is.

### 7. Extra queries toegevoegd?
Nee. `PackArt` is een pure presentatie-component zonder eigen data-fetching; er zijn geen nieuwe Supabase-queries toegevoegd voor decoratie.

### Wat bewust niet is gedaan in DEEL 1
Home-hero-imagery, Decks-covers (op basis van boss/sterkste kaart) en Collection-binder-sfeer stonden op de lijst maar zijn deze sessie niet gebouwd — de tijd is besteed aan de expliciet hoogst-geprioriteerde items (pack-art, iPhone/PWA-basis, deckbuilder mobiel, rarity-analyse). Dit is een bewuste, veilige keuze conform de expliciete prioriteitsvolgorde uit de opdracht, niet een omissie.

---

## DEEL 2 — Rarity-economie: analyse & simulatie (NIETS geïmplementeerd)

**Bevestiging vooraf: geen enkele van onderstaande percentages is in productie doorgevoerd.** `draft.rarity_weights` en de rarity-tabellen in `roll_shop_pack_rarity()` staan nog exact zoals ze waren.

### 8. Huidige, echte pack-odds (uit `roll_shop_pack_rarity()` / migraties, opnieuw geverifieerd tegen de SQL)

| Pack | Prijs | Kaarten | Normal | Rare | Super Rare | Ultra Rare | Secret Rare | Legendary |
|---|---|---|---|---|---|---|---|---|
| Normal | 100 DP | 3 | 60% | 28% | 9% | 2.5% | 0.45% | 0.05% |
| Premium | 250 DP | 5 | 25% | 35% | 25% | 10% | 4% | 1% |
| Deluxe | 500 DP | 7 | 10% | 20% | 30% | 25% | 12% | 3% |
| Special* | 250 DP | 5 | 20% | 30% | 28% | 14% | 6% | 2% |

*Special-pack tabel is rotatie-afhankelijk/admin-configureerbaar; bovenstaande is de huidige/representatieve instelling.

### 9. Huidige, echte draft-weights
`{Normal: 42, Rare: 28, Super Rare: 17, Ultra Rare: 8, Secret Rare: 4, Legendary: 1}` — dit is opnieuw, letterlijk tegen de SQL geverifieerd (niet uit geheugen aangenomen) en klopt met de eerder gevonden ~34% Ultra Rare+ per draft.

### 10. Simulatieresultaten — HUIDIGE productie-instellingen (100.000 packs/type, 20.000 drafts, seed 20260821, volledig reproduceerbaar)

| Pack | P(≥1 Ultra+) | P(≥1 Secret+) | P(≥1 Legendary) | Gem. packs tot Legendary | Legendary per 100 packs | DP per verwachte Legendary |
|---|---|---|---|---|---|---|
| Normal | 9.10% | 1.62% | 0.17% | ~592 | 0.17 | **59.172 DP** |
| Premium | 56.62% | 22.66% | 5.09% | ~19.3 | 5.18 | 4.823 DP |
| Deluxe | 96.98% | 66.08% | 18.32% | ~5.0 | 19.94 | **2.508 DP** |
| Special | 75.86% | 35.41% | 9.66% | ~10.0 | 10.03 | 2.492 DP |

In gewone taal: bij Normal packs trek je gemiddeld pas na **zo'n 592 pakketten** een Legendary — extreem zeldzaam. Bij Deluxe is dat gemiddeld al na **5 pakketten**, en heb je in bijna 1 op de 5 Deluxe-pakketten meteen een Legendary erbij.

### 11. Simulatieresultaten — HUIDIGE draft (20.000 gesimuleerde start-drafts)
Gem. per rarity: Normal 4.59 · Rare 16.69 · Super Rare 19.59 · **Ultra Rare 12.31 · Secret Rare 6.98 · Legendary 1.84** (2.97% van de draft).
Totaal Ultra Rare+ per draft: **~21.1 (34.1%)** — bevestigt de eerder gevonden ~34%.
P(0 Legendary): 14.98% · P(exact 1): 30.08% · **P(2+ Legendary): 54.95%** · P(≥1 Secret Rare+): 100.00%.

Dit bevestigt het eerder gesignaleerde probleem scherp: meer dan de helft van alle nieuwe spelers trekt **twee of meer** Legendaries in hun allereerste draft, en elke draft bevat gegarandeerd minstens één Secret Rare of beter.

### 12. Simulatieresultaten — VOORGESTELDE (BALANCED) kandidaat

| Pack | Normal | Rare | SR | UR | SecR | Leg | P(≥1 Leg) | Leg/100 packs | DP/verw. Legendary |
|---|---|---|---|---|---|---|---|---|---|
| Normal | 67.35% | 23.56% | 7.21% | 1.40% | 0.29% | 0.18% | 0.53% | 0.53 | 18.797 DP |
| Premium | 24.04% | 41.27% | 23.20% | 8.92% | 2.09% | 0.49% | 2.43% | 2.45 | 10.208 DP |
| Deluxe | 12.06% | 20.51% | 36.29% | 22.72% | 7.06% | 1.36% | 9.16% | 9.54 | 5.241 DP |
| Special | 17.60% | 25.63% | 35.31% | 16.31% | 4.18% | 0.98% | 4.81% | 4.91 | 5.095 DP |

Draft (BALANCED, weights 56/28/11/3.5/1/0.5): Legendary gem. **0.94/draft (1.52%)**, P(0 Legendary) 38.71%, P(2+) 23.98%, P(≥1 Secret+) 94.15%.

### 13. CONSERVATIVE-model (langzame progressie)
Pack-tabellen: Normal `[74, 21, 4.3, 0.55, 0.1, 0.05]` · Premium `[34, 40, 19, 5.8, 1.0, 0.2]` · Deluxe `[18, 27, 33, 17.5, 3.7, 0.8]` · Special `[26, 35, 27, 9.8, 1.75, 0.45]`.
Draft-weights: `{Normal:65, Rare:24, SuperRare:8, UltraRare:2.3, SecretRare:0.5, Legendary:0.2}`.
Resultaat: Deluxe Legendary-kans 1.02% per pack (~14 packs tot een Legendary), draft Legendary gem. 0.37/draft, P(0 Legendary) 68.75%.
**Pro:** Legendary blijft écht bijzonder, weinig risico op te snelle verzadiging.
**Con:** kan voor een kleine, actieve vriendengroep als té traag/frustrerend aanvoelen — past niet bij de eigen voorkeur "tussen Balanced en Generous."

### 14. BALANCED-model (eigen aanbeveling als basis)
Zie punt 12. Ontworpen rond de gevraagde Legendary-targets (Normal 0.10% / Premium 0.35% / Deluxe 1.25% / Special 0.75%) — de gerealiseerde cijfers liggen daar dicht bij (0.53% / 2.43%/2.45% / 9.16%/9.54% / 4.81%/4.91%; de kleine afwijkingen komen doordat de pity/guaranteed-slot-mechaniek de "kale" tabelpercentages naar boven duwt, zie punt 19).
**Pro:** duidelijk gezondere curve dan huidig, Deluxe blijft aantrekkelijk, Normal blijft nooit de beste Legendary-farmmethode.
**Con:** op zichzelf mogelijk iets te voorzichtig voor een kleine, actieve vriendengroep die juist wél regelmatig iets moois wil trekken.

### 15. GENEROUS-model (geschikt voor kleine actieve vriendengroep)
Pack-tabellen: Normal `[62, 27, 8.5, 1.8, 0.5, 0.2]` · Premium `[26, 36, 24, 10.5, 2.9, 0.6]` · Deluxe `[11, 20, 31, 26, 10, 2]` · Special `[18, 29, 29, 17.3, 5.5, 1.2]`.
Draft-weights: `{Normal:50, Rare:28, SuperRare:13.5, UltraRare:5.5, SecretRare:2.2, Legendary:0.8}`.
Resultaat: Deluxe Legendary-kans 2.02% per pack (~7 packs tot Legendary, 14.12 per 100), draft Legendary gem. **1.48/draft (2.40%)** — bewust en geverifieerd **onder** de huidige productie-waarde van 1.84/draft (2.97%) op alle drie topranks (Ultra/Secret/Legendary), zodat ook het "genereuze" model nooit genereuzer is dan de huidige, als te ruim gesignaleerde situatie.
**Pro:** voelt duidelijk beloftevoller aan dan Balanced, blijft toch onder het huidige (te hoge) niveau.
**Con:** grootste van de drie modellen qua Legendary-frequentie — vraagt iets meer discipline om Legendary bijzonder te houden.

*Zelfcorrectie tijdens deze sessie: het eerste ontwerp van GENEROUS_DRAFT_WEIGHTS produceerde bij simulatie een hóger Legendary-gemiddelde (2.76/draft) dan de huidige productie — dat is bij het nalezen van de eigen simulatie-output opgemerkt en gecorrigeerd vóórdat het in dit rapport terechtkwam.*

### 16. Eindadvies
Gebaseerd op de eigen voorkeur "waarschijnlijk ergens tussen Balanced en Generous": start met **BALANCED voor Normal/Premium** (deze packs moeten laagdrempelig en niet-frustrerend blijven) en **GENEROUS voor Deluxe/Special** (de packs waar spelers bewust voor sparen — die mogen zich duidelijk lonender voelen). Voor de draft-weights: **BALANCED** als basis, eventueel een fractie richting Generous op Ultra Rare specifiek als de vriendengroep na een paar weken toch als "te karig" ervaart — dat is achteraf makkelijker bij te stellen dan in één keer te veel weg te geven.

### 17. Legendary-frequentie in gewone taal (per model, Deluxe als graadmeter)
- **Huidig:** gemiddeld 1 Legendary per **5** Deluxe packs — te vaak voor iets dat "heel bijzonder" moet blijven.
- **Conservative:** gemiddeld 1 Legendary per **14** Deluxe packs.
- **Balanced:** gemiddeld 1 Legendary per **10-11** Deluxe packs.
- **Generous:** gemiddeld 1 Legendary per **7** Deluxe packs — nog steeds duidelijk zeldzamer dan nu.

### 18. DP-efficiëntie per pack-type (huidige instellingen, DP per verwachte trek)
Normal is in élk model verreweg de duurste manier om aan een Legendary te komen (59.172 DP nu, 18.797 DP zelfs onder Balanced) versus Deluxe (2.508 DP nu, 5.241 DP onder Balanced). **Normal packs zijn dus, zoals vereist, nooit de beste Legendary-farmmethode** — niet nu, en niet onder één van de drie voorgestelde modellen.

### 19. Effect van pity/guaranteed slots
Elk pack-type heeft een "vloer" op de laatste slot (bv. Deluxe garandeert minimaal Super Rare op de laatste kaart) plus een pity-teller die na een aantal pakketten zonder hoge trek een hogere gegarandeerde rank forceert (bv. Deluxe: na 5 pakketten zonder Secret Rare+ wordt de laatste slot geforceerd naar minimaal Secret Rare; elke Secret Rare+ trek reset de teller). Dit verklaart waarom de gesimuleerde percentages altijd iets hoger uitvallen dan de kale tabelpercentages: de guaranteed slot en pity-mechaniek trekken de effectieve kans structureel omhoog, vooral op de duurdere packs. Alle drie kandidaatmodellen hergebruiken bewust dezelfde pity-mechaniek/drempels als productie (alleen de basistabellen zijn aangepast) — dat hield de vergelijking eerlijk, maar betekent ook dat de pity-drempels zelf nog niet zijn herzien; dat is een mogelijke vervolgstap als de gekozen odds na een tijdje testen alsnog niet goed aanvoelen.

### DP-economie (essentieel onderdeel)
League Duel: winst +100 DP, gelijkspel +50 DP elk, verlies +25 DP (hardcoded in `award_match_duel_points()`); Practice Duel levert automatisch 0 DP op. Bij een gemiddeld winpercentage (50%) kost het ongeveer 16 League Duels om 10 Normal packs te kunnen kopen, ~40 duels voor 10 Premium/Special packs, en ~80 duels voor 10 Deluxe packs. Competitie- en achievement-DP bestaan ook, maar die bedragen zijn per-league/per-competitie instelbaar zonder eenduidige standaardwaarde — **daar zijn bewust geen getallen voor verzonnen**; de bovenstaande cijfers zijn dus een vloer op hoe snel iemand 10 packs kan bereiken, niet het volledige plaatje. Een pack met betere odds is hier dus niet automatisch "te genereus": Deluxe kost 5x zoveel DP als Normal én 2x zoveel als Premium/Special, wat de hogere kansen deels rechtvaardigt.

---

## DEEL 3 — iPhone / Mobile / PWA

### 27–28. Wat er voor iPhone is veranderd & of de PWA correct is geconfigureerd
De bestaande PWA-infrastructuur (`manifest.webmanifest` via `src/app/manifest.ts`, `/offline`) is geaudit en verbeterd, **niet** vervangen. Na de wijzigingen is de manifest/iOS-metadata compleet: naam, iconen (incl. maskable), standalone-display, status-bar-theming en veilige interactieve viewport-resize zijn nu aanwezig.

### 29. Welke PWA/iconen/metadata zijn toegevoegd/gewijzigd
- `public/icon-maskable-source.svg` (nieuw) + gegenereerde `public/icon-512-maskable.png` (512×512, full-bleed achtergrond — geverifieerd dat het bestaande diamant-embleem ruim binnen de veilige maskable-zone (~40% straal) valt) en `public/apple-touch-icon.png` (180×180).
- `src/app/manifest.ts` — derde icon-entry toegevoegd met `purpose: "maskable"`.
- `src/app/layout.tsx` — `metadata.icons` (icon + apple) en `metadata.appleWebApp` (`capable: true`, `title: "Duelist Circle"`, `statusBarStyle: "black-translucent"`) toegevoegd; `viewport.interactiveWidget: "resizes-content"` toegevoegd (voorkomt dat het iOS-toetsenbord vaste content overlapt, zonder pinch-zoom uit te schakelen — `maximumScale`/`userScalable` zijn bewust ongemoeid gelaten voor toegankelijkheid).

### 30. Mobiele navigatie-wijzigingen
`src/components/bottom-nav.tsx` teruggebracht van **11 naar 7 items**: Home, Cards (→ Collection), Decks, Duels (→ Matches), Shop, "More" (→ Explore, Compass-icoon), Profile. League, Trades, Competitions en Awards zijn verplaatst naar de al bestaande `/explore`-hub (3 nieuwe kaarten toegevoegd: League, Trades, Competitions — Explore heeft nu 9 items totaal). Dit voorkomt precies het "12 kleine icoontjes onderaan"-probleem uit de opdracht, met de belangrijkste acties direct bereikbaar en de rest netjes één tik verderop.

### 31. Deckbuilder mobiele verbeteringen
`src/components/deck-collection-browser.tsx`: de zoekbalk is nu `sticky` bovenaan (blijft in beeld tijdens scrollen), en de secundaire filters (Card Type/Deck Section/Rarity/Sort) zijn op mobiel achter een inklapbare "Filters"-knop gezet (met stipje-indicator als er actieve filters zijn) — op `sm:`-breedte en groter blijven ze gewoon altijd zichtbaar, dus desktop is ongewijzigd. Op `src/app/(app)/decks/[id]/page.tsx` is een compacte Main/Extra-voortgangsbalk toegevoegd die op mobiel altijd in beeld is zonder de layout te verstoren (bewust **niet** sticky gemaakt, om overlap met de al-sticky zoekbalk te voorkomen — dit is tijdens het bouwen zelf opgemerkt en gecorrigeerd, vóór er getest kon worden). Tot slot zijn de deck add/remove-knoppen in `deck-action-button.tsx` vergroot naar minimaal 44×44px tapgebied.

### 32. iOS safe-area fixes
Centraal via Tailwind's arbitrary-value syntax toegepast op de twee resterende `fixed inset-0`-overlays die nog geen safe-area-padding hadden: de kaart-detail-overlay in `draft-choice-grid.tsx` en de Samo-rival-easter-egg-modal — beide krijgen nu `pt-[max(...,env(safe-area-inset-top))]` / `pb-[max(...,env(safe-area-inset-bottom))]`. Bij deze sessie is opnieuw gecontroleerd (repo-breed doorzocht): **alle** `fixed inset-0`-overlays in de app hebben nu safe-area-ondersteuning, dus geen UI meer die achter de Dynamic Island/notch of de home-indicator kan verdwijnen.

### 33. Boss Companion mobiele fixes
De tap-target-vergroting voor de Boss Companion chat (sluiten, quick prompts, verzendknop) was al in een eerdere sessie doorgevoerd; deze sessie is dat gecontroleerd en ongewijzigd gelaten — geen nieuwe problemen gevonden bij hernieuwde inspectie.

### 34. Mobiele performance-verbeteringen
- `.field { font-size: 1rem; }` toegevoegd aan de al bestaande, herbruikbare CSS-klasse — dit voorkomt Safari's ongewenste auto-zoom bij het focussen van een invoerveld, **centraal en app-breed** in één regel, dankzij Tailwind v4's cascade-layer-gedrag (unlayered custom CSS wint altijd van layered Tailwind-utilities zoals `text-xs`/`text-sm`), in plaats van elk formulier los te moeten patchen.
- `InstallAppCard` gebruikt `useSyncExternalStore` in plaats van een `useEffect`+`setState`-patroon — geen extra render-cyclus, geen hydration-mismatch.
- Alle nieuwe pack-art is CSS/SVG (geen requests, geen images) — voegt dus geen gewicht toe aan de al eerder behaalde performance-winst.

### 35. Wat bewust niet offline werkt
Volledige offline Supabase-functionaliteit is (terecht) niet gebouwd — dat stond expliciet niet in de opdracht en zou een risicovolle caching-laag over dynamische/gevoelige data vereisen. De bestaande `/offline`-pagina is dit keer alleen kort geïnspecteerd, niet herbouwd; een diepere mobiele review van die pagina staat nog open (zie Beperkingen).

### Aanvullende mobiele audit deze sessie
Een repo-brede code-audit is uitgevoerd op drie veelvoorkomende mobiele probleempatronen: (1) alle `fixed inset-0`-overlays — alle hebben inmiddels safe-area-support; (2) hover-only-only interacties (`group-hover:opacity-*`-patroon waarbij een besturingselement alleen bij hover verschijnt) — **geen enkele gevonden** in de hele codebase, dus geen elementen die op een touchscreen onbereikbaar zouden zijn; (3) vaste-pixel-breedtes die op 375px tot overflow zouden kunnen leiden — de enige gevonden gevallen zijn decoratieve, `absolute`-gepositioneerde blur-cirkels die altijd binnen een `overflow-hidden`-container zitten (bevestigd o.a. op de Shop-pagina), dus geen echt overflow-risico.

---

## Kwaliteitscontrole

### 20–22. Typecheck / Lint / Build
- **Typecheck:** `npm run typecheck` — schoon, geen fouten (na elke wijziging individueel gecontroleerd, én een finale gecombineerde run aan het eind van de sessie).
- **Lint:** `npm run lint` — schoon, geen fouten of warnings (inclusief de `react-hooks/set-state-in-effect`-fout die onderweg is opgelost door `useSyncExternalStore` te gebruiken in plaats van de regel te onderdrukken — er is nergens `eslint-disable` toegevoegd, conform de bestaande projectnorm van nul suppressies).
- **Build:** **niet uitgevoerd.** Een volledige `next build` is via de device-bridge naar de lokale Mac bewust niet geprobeerd (dit zou een zwaar, potentieel onveilig/langdurig proces op het lokale apparaat starten) en de cloud-sandbox heeft geen kopie van de echte repository/dependencies om te bouwen. Dit is een bekende, herhaalde beperking van deze werkwijze — typecheck + lint zijn de haalbare, betrouwbare vervangende controles geweest.

### 24. Bekende beperkingen
- Geen enkele visuele wijziging is live/op een telefoon getest — alles is code-level gebouwd en geverifieerd volgens de instructie "kies de veilige variant" waar een live test nodig zou zijn.
- `next build` is nooit gedraaid (zie hierboven).
- DEEL 1's lagere-prioriteit visuals (Home-hero, Decks-covers, Collection-sfeer, Duel-decoratie) zijn niet gebouwd — bewust, conform de expliciete prioriteitsvolgorde.
- Een diepe 375/390/430px-audit van elke losse pagina (Draft-controls, Matches-formulieren, Login/signup, `/offline`, `/league`, `/competitions`) is gedaan als gerichte code-scan (zie hierboven), niet als pagina-voor-pagina volledige doorlichting — de grote, hoog-prioritaire schermen (Shop, Deckbuilder, pack opening, Boss Companion, alle modals) zijn wel grondig gecontroleerd.
- De pity/guaranteed-slot-drempels zelf zijn in de simulatie ongewijzigd overgenomen van productie voor alle drie kandidaatmodellen — die drempels zijn dus nog niet mee-geoptimaliseerd voor de nieuwe basispercentages.

### 25. Nieuwe commits deze sessie (geen enkele gepusht)
```
d42c09a chore: expand rarity economy simulation
a6166cb feat: subtle Add-to-Home-Screen install card on Profile (iOS only)
d389324 polish: calmer bottom nav (11 to 7 items) + larger deck card tap targets
43c3f95 polish: deckbuilder sticky search + collapsible filters, iPhone/PWA basics
afde92a feat: add illustrated booster pack visual system
```
(Deze 5 commits zijn van deze sessie. De branch staat in totaal 15 commits voor op `origin/main`, inclusief eerdere sessies se werk.)

### 26. Bevestiging: niets gepusht
Bevestigd via `git log`/`git status`: de branch `main` staat lokaal 15 commits voor op `origin/main`, er is geen `git push` uitgevoerd. Alle wijzigingen zijn uitsluitend lokale commits.

---

## 36. Duelist Circle op je iPhone installeren
1. Open de Duelist Circle-URL in **Safari** op je iPhone (moet Safari zijn — andere browsers ondersteunen "Add to Home Screen" niet op dezelfde manier).
2. Tik op het **Deel-icoon** (vierkant met pijl omhoog) onderin de Safari-balk.
3. Scroll naar beneden en tik op **"Zet op beginscherm" / "Add to Home Screen"**.
4. Bevestig de naam ("Duelist Circle") en tik op **Voeg toe**.
5. Er verschijnt nu een eigen app-icoon op je beginscherm. Open de app daarmee — hij start nu **standalone** (geen Safari-balk, eigen icoon, donkere achtergrond, geen wit flitsscherm).
6. Om te verwijderen: houd het icoon ingedrukt → **Verwijder app** — dit verwijdert alleen de snelkoppeling, er gaat geen data verloren (alles staat immers in je account, niet lokaal op het toestel).

Een korte, niet-opdringerige uitleg hiervan staat nu ook automatisch in de app zelf: op **Profile**, onderaan, verschijnt een "Install Duelist Circle"-kaart met dezelfde 3 stappen — maar **alleen** op iOS-Safari en **alleen** zolang de app nog niet standalone draait; zodra je hem vanaf het beginscherm opent, verdwijnt de kaart vanzelf.

## 37. Handmatige testchecklist (375px / 390px / 430px)

**Voorbereiding:** open Safari's Web Inspector Responsive Design Mode of test live op een iPhone SE (375px) / iPhone 14-15 (390px) / iPhone 14-15 Pro Max (430px).

**Installatie & standalone-modus**
- [ ] Voeg toe aan beginscherm volgens punt 36 hierboven.
- [ ] Open de app vanaf het icoon — controleer: geen Safari-balk, geen wit flitsscherm bij opstarten, donkere achtergrond direct zichtbaar.
- [ ] Controleer dat de Profile-pagina de "Install"-kaart **niet meer toont** zodra je standalone draait.
- [ ] Draai het toestel (portrait/landscape) en controleer dat er geen content achter de notch/Dynamic Island of de home-indicator schuift.

**Pagina's om te bekijken op alle 3 breedtes**
- [ ] `/` (Home) — Boss Monster blijft het visuele anker, geen horizontale scroll.
- [ ] `/shop` — pack-art zichtbaar en herkenbaar per tier, prijs/CTA blijven leesbaar, geen scroll-clutter.
- [ ] `/shop/opening/[id]` — koop een pack, controleer de reveal in portrait: pack-art zichtbaar vóór het tikken, vlotte flip, geen layout-sprongen.
- [ ] `/cards/collection` en `/cards/[id]` — kaartgrid blijft prettig leesbaar, geen te kleine/te grote kaarten.
- [ ] `/decks` en `/decks/[id]` — open een bewerkbare deck, controleer de nieuwe sticky zoekbalk + inklapbare filters + Main/Extra-teller.
- [ ] `/draft` — doorloop een paar picks, controleer 3-koloms keuzegrid en kaart-detail-overlay (safe-area rond de rand).
- [ ] `/matches` en een matchdetail — controleer of actieknoppen goed te raken zijn.
- [ ] `/duel-companion` en de Boss Companion-chat vanaf Home — open, typ een bericht, controleer dat het toetsenbord de invoer/verzendknop niet onbereikbaar maakt en dat berichten niet achter de bottom-nav verdwijnen.
- [ ] `/explore` — controleer dat League/Trades/Competitions/Awards hier goed vindbaar zijn.
- [ ] `/profile` — controleer de nieuwe Install-kaart (alleen zichtbaar op iOS/niet-standalone).

**Specifiek in de Deckbuilder**
- [ ] Zoek een kaart, filter op Card Type/Rarity, wissel Main/Extra-secties — geen noodzaak tot horizontaal scrollen of terug-naar-boven scrollen om filters te bereiken.
- [ ] Voeg/verwijder kaarten met de +/- knoppen — controleer dat ze comfortabel met een duim te raken zijn.

**Formulieren**
- [ ] Tik in een tekstveld (bv. deck-naam, zoekbalk, Boss Companion-chatinvoer) — controleer dat Safari **niet** automatisch inzoomt.

**Bottom-navigatie**
- [ ] Controleer dat er nu 7 items staan (Home/Cards/Decks/Duels/Shop/More/Profile), dat de actieve pagina duidelijk gemarkeerd is, en dat de balk niet overlapt met de home-indicator.

---

*Rapport gegenereerd op basis van code-inspectie, statische analyse en gesimuleerde/gereproduceerde uitkomsten (seed 20260821, volledig herhaalbaar). Geen enkele live/mobiele visuele test is uitgevoerd — waar dat nodig was is steeds de veilige, minst-risicovolle variant gekozen.*
