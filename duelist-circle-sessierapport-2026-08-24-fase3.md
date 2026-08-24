# Duelist Circle — Sessierapport Fase 3 (Duelist Coach product)

**Datum:** 24 augustus 2026
**Scope:** Fase 3 — de deterministische infrastructuur uit Fase 1+2 omzetten in het daadwerkelijke Duelist Coach-product, in de opgegeven prioriteitsvolgorde: 1) mechanics operationeel maken, 2) Card Detail Coach, 3) Dashboard Coach, 4) Deck Doctor UI, 5) Discovery/Trade-intelligentie, 6) optionele AI-uitleglaag, 7) performance/caching-hardening.
**Regels gerespecteerd:** geen push, geen deploy, geen aanraking van productie, geen reset/verwijdering van spelersdata, alleen additieve migraties.

---

## 1. Voltooide features

- **Mechanics-pipeline operationeel gemaakt** — `scripts/compute-synergy-graph.mjs` heeft nu een `--incremental` modus die alleen kaarten herberekent waarvan `card_mechanics.engine_version` ontbreekt of verouderd is, geschreven via upsert (idempotent, veilig te herhalen). Zie punt 3 en punt 19/20 voor waarom dit nog niet tegen productie is uitgevoerd.
- **Card Detail Coach** — volledig herbouwd naar drie strikt gescheiden modi: **My Cards** (alleen kaarten die de speler zelf bezit), **Discover** (relevante, niemand-bezit-hem kaarten), **Trade Targets** (bezit van een ander leaguelid, met directe link naar diens binder). Elke suggestie toont een confidence-badge (Hoog/Middel/Laag), uitklapbaar bewijs, en — waar van toepassing — de eigenaar. Nieuw: bounded 2-3-kaart package-detectie tussen eigen kaarten.
- **Dashboard Duelist Coach** — compacte, gecachte sectie op het dashboard. **Geen enkele live AI-aanroep tijdens render.** Toont tot 4 soorten inzichten (Normal Summon-competitie, GY-onbalans, niet-ondersteunde Extra Deck-kaart, owned-improvement), herberekend alleen bij fingerprint-wijziging of expliciete Refresh-actie.
- **Deck Doctor UI** — het deterministische Fase 2-fundament is nu daadwerkelijk zichtbaar als een uitklapbaar Deck Health-paneel op de deckbuilder-pagina, met Strengths/Attention/From Your Collection/Other-secties.
- **Discovery/Trade-coaching** — grotendeels opgelost binnen de Card Coach-herbouw (Discover/Trade Targets-modi); geen aparte subsysteem nodig gebleken.
- **Twee echte bugs gevonden en gefixed tijdens hand-verificatie** (zie punt 14) — niet cosmetisch, beide waren productiecode-fouten die de Coach-output daadwerkelijk verkeerd zouden hebben gemaakt.

**Niet gehaald binnen deze sessie (bewust, conform de expliciete stopvoorwaarde):** de optionele AI-uitleglaag (Sectie 6 van de opdracht). Zie punt 10/16/17 voor onderbouwing — dit was uitdrukkelijk het laagste-prioriteit, meest uitstelbare onderdeel, en de tijd is in plaats daarvan besteed aan het vinden/fixen van echte fouten in de deterministische laag ("It is NOT acceptable to build flashy AI before mechanics/data are reliable" — letterlijk uit de opdracht).

---

## 2. Zichtbare Coach-functionaliteit voor de speler

- Op een **kaartdetailpagina**: een Coach-sectie met drie subsecties (My Cards / Discover / Trade Targets), elk met kaartrijen die een confidence-badge, een korte deterministische reden, en uitklapbaar "Evidence" tonen. Trade Targets tonen bovendien wie de kaart bezit en een knop naar diens binder. Een aparte "Packages"-sectie toont tot 2 gevonden 2-3-kaart combinaties uit eigen bezit.
- Op het **dashboard**: een "DUELIST COACH"-paneel met per inzicht een korte, jargonvrije zin (bv. "Veel kaarten concurreren om je Normal Summon.") plus confidence-badge, en een Refresh-knop. Leeg/geen-actief-deck-status wordt eerlijk getoond, nooit een lege of misleidende kaart.
- Op de **deckbuilder-pagina**: een uitklapbaar "Deck Health"-paneel direct onder de compositie-samenvatting, met Strengths/Attention/From Your Collection/Other en per finding een confidence-badge en uitklapbaar bewijs.

---

## 3. Mechanics-populatie-architectuur

`scripts/compute-synergy-graph.mjs` (uitgebreid, niet herschreven):

- **Full mode (standaard):** alle kaarten herberekend, resultaat via `upsert` op `card_catalog_id` weggeschreven — nooit een insert-only run die op een herhaling zou falen.
- **`--incremental` (nieuw):** haalt eerst `card_mechanics.select("card_catalog_id, engine_version")` gepagineerd op, bepaalt welke kaarten ontbreken of een ander `engine_version` hebben dan de huidige `SYNERGY_ENGINE_VERSION`, en beperkt zowel de te schrijven `card_mechanics`-rijen als de `card_synergy_edges`-rijen (elke edge waarvan bron- of doelkaart stale is) tot die deelverzameling.
- **`--write` blijft verplicht** om daadwerkelijk te schrijven — dry-run is en blijft de standaard.
- Geen enkele manuele/curator-ingevoerde kolom (rarity, economy, release policy) wordt aangeraakt — de pipeline schrijft uitsluitend naar `card_mechanics`/`card_synergy_edges`/`card_synergy_engine_runs`.
- Geen 14k×14k naive scan: kandidaatparen worden nog altijd via de bestaande, in Fase 1 gebouwde gefilterde matching-logica bepaald, niet een volledige cross-join.

**Verificatie:** `node --check` (syntax), plus een losstaand 5-scenario smoke-script tegen de exacte staleness/edge-filter-logica (5/5 geslaagd), plus de bestaande `synergy-engine.mjs`-regressietest (16/16, ongewijzigd geslaagd).

---

## 4. Nieuwe migraties

Eén nieuwe, additieve migratie: **`supabase/migrations/202608241100_dashboard_coach_insights.sql`**.

- Nieuwe tabel `dashboard_coach_insights` (profile_id, league_id, insight_type, evidence jsonb, deterministic_summary, confidence, state_fingerprint, engine_version, ai_explanation nullable, generated_at), `unique (profile_id, league_id, insight_type)`.
- Index op `(profile_id, league_id)`.
- RLS: **speler-eigen-data-patroon** (afwijkend van Fase 1's publieke-referentiedata-patroon) — vier policies, elk scoped op `profile_id = auth.uid()` voor rol `authenticated`. Een normale ingelogde sessie kan dus zelf lezen/schrijven zonder service-role key; geen enkele speler kan een andere speler se rij zien of wijzigen.
- Geen enkele bestaande tabel, kolom, of policy is gewijzigd of verwijderd.

---

## 5. Nieuwe scripts/commands

- `node scripts/compute-synergy-graph.mjs` — dry-run, full (ongewijzigd gedrag).
- `node scripts/compute-synergy-graph.mjs --write` — schrijft, full run.
- `node scripts/compute-synergy-graph.mjs --write --incremental` — **nieuw**, schrijft alleen stale/ontbrekende kaarten. Dit is het commando dat na deze sessie tegen productie zou moeten draaien om `card_mechanics` daadwerkelijk te vullen (zie punt 19/20 — **niet uitgevoerd**, alleen het commando zelf).

---

## 6. Card Coach-architectuur

`src/lib/ai/card-synergy-context.ts` (server-orchestratie) — na de bestaande `generateSynergyCandidates`-aanroep:

1. `getLeagueIdForUser` bepaalt de league van de ingelogde speler (server-derived, nooit client-supplied).
2. `batchGetCardAvailability` (Fase 2, ongewijzigd) classificeert alle kandidaten in één query + één hergebruikte profiel-lookup.
3. `splitCandidatesByAvailability` splitst strikt in owned/tradeTargets/discovery — format-ineligible kaarten worden overal uitgesloten.
4. Elke lijst wordt tot een klein top-N (3/2/2) beperkt vóórdat de bestaande AI-uitlegstap (`explainSynergyCandidates`, ongewijzigd) erop losgelaten wordt.
5. `deriveConfidence()` (nieuw, pure functie) kent Hoog/Middel/Laag toe op basis van **bewijskwaliteit**: een zwakke reden (shared_attribute/monster_type/archetype) telt nooit mee; één echte mechanische reden is al minstens Middel; twee onafhankelijke echte redenen, of één sterke (gewicht ≥ 40), is Hoog.
6. `findOwnedPackages()` (nieuw) zoekt tot 2 owned-2/3-kaart-combinaties via `card_synergy_edges` binnen een kleine (≤6) owned-kandidatenset — nooit een volledige collectie-scan.

`src/components/card-synergy-insight.tsx` — herbouwd rond drie `Section`-blokken (My Cards/Discover/Trade Targets) plus een Packages-blok, met confidence-badges, uitklapbaar bewijs, en (alleen voor Trade Targets) een link naar de binder van de eigenaar. Lazy-load-on-click blijft behouden — geen Coach-data wordt opgehaald totdat de speler de sectie daadwerkelijk opent.

---

## 7. Dashboard-caching en fingerprinting

`src/lib/ai/dashboard-coach.ts` (nieuw) is de **enige** module die naar `dashboard_coach_insights` schrijft.

- `computeStateFingerprint(deckId, cardIds)` — SHA-256 over `versie|deckId|gesorteerde-kaart-ids`. Deterministisch, ordening-onafhankelijk, gevoelig voor zowel kaartset- als deck-wijziging (4 losse tests hierop).
- `getOrRefreshDashboardCoachInsights(supabase, userId, leagueId, activeDeckId, forceRefresh)`:
  - Geen actief deck → `[]`, **nul** database-aanroepen.
  - Cache aanwezig én fingerprint matcht én geen `forceRefresh` → cache direct geretourneerd, **geen** `card_mechanics`-query, **geen** upsert.
  - Fingerprint-mismatch of `forceRefresh=true` → herberekening via `analyzeDeck` (Fase 2, ongewijzigd), upsert van de nieuwe inzichten, plus een scoped delete van insight-types die niet meer vuren.
  - Elke `dashboard_coach_insights`-query is expliciet gescoped op zowel `profile_id` als `league_id`.
- De expliciete Refresh-knop op het dashboard (`src/app/actions/dashboard-coach.ts`, server action) roept dezelfde functie aan met `forceRefresh=true`; `userId` komt altijd van `requireUser()`, nooit van de client.
- **Geen enkele AI-aanroep** ergens in dit pad — `aiExplanation` is altijd `null` op elk berekend inzicht.

---

## 8. Deck Doctor-integratie

`src/app/(app)/decks/[id]/page.tsx` — twee nieuwe, bounded queries direct vóór de bestaande Master Duel-legaliteitssectie:

1. `card_mechanics` voor de kaarten die daadwerkelijk in het deck zitten (`.in("card_catalog_id", deckCardIds)`).
2. `card_mechanics` voor owned-maar-niet-in-deck kaarten, **vooraf gefilterd** met `.overlaps("tags", ["gy_setup","fusion_enabler","xyz_enabler"])` — nooit de volledige collectie opgehaald.

`analyzeDeck(...)` (Fase 2, ongewijzigd) produceert het report; een nieuw `DeckDoctorPanel`-component groepeert de findings (Strengths/Attention/From Your Collection/Other) en toont per finding een confidence-badge en uitklapbaar bewijs. Wanneer `card_mechanics` nog leeg is voor dit deck, toont het paneel expliciet "hasn't been analyzed yet" — nooit een stilzwijgend "gezond deck". Het deck wordt nooit automatisch aangepast; de speler moet zelf kaarten toevoegen/verwijderen.

---

## 9. Discovery/trade-gedrag

Volledig via de Card Coach's Discover/Trade Targets-modi (punt 6):

- **Trade Target** — een ander leaguelid bezit de kaart → getoond met eigenaar + link naar diens binder.
- **Discovery** — relevant, niemand in de league bezit hem → getoond zonder eigenaarsinformatie, geen suggestie dat de kaart "verkrijgbaar" is via een specifieke route.
- **Format-ineligible** kaarten worden op elk niveau (owned/discover/tradeTarget) uitgesloten — nooit gesuggereerd als bruikbaar.
- Er wordt nergens beweerd dat een speler een kaart kan verkrijgen wanneer dat niet zo is; Trade Target-kaarten linken naar de bestaande binder-/trade-flow, niet naar een claim van automatische verkrijgbaarheid.

---

## 10. AI-integratie

**Niet gebouwd deze sessie** — bewuste, expliciet toegestane keuze (Sectie 16 van de opdracht: "It is completely acceptable to defer AI explanation if deterministic Coach functionality is excellent"). De bestaande provider-architectuur (`card-synergy.ts`/`boss-companion.ts`: directe `fetch` naar Anthropic, `AbortSignal.timeout`, try/catch → `null` bij elke fout, striktvalidatie van kaart-ids tegen de daadwerkelijke kandidatenset) is **ongewijzigd hergebruikt** voor de bestaande AI-uitlegstap binnen Card Coach (`explainSynergyCandidates`) — dat onderdeel werkte al vóór deze sessie en blijft intact. Een NIEUWE, aparte laag specifiek voor "leg deze Deck Doctor-finding uit" / "leg deze 2-3-kaart-interactie uit" is niet gebouwd.

---

## 11. AI-fallbackgedrag

Voor het bestaande, hergebruikte pad (`explainSynergyCandidates` binnen Card Coach): bij elke fout (ontbrekende key, netwerkfout, time-out, ongeldige output) valt de functie terug op `null`/een lege uitleg — de deterministische Coach-data (kaartnaam, reden, confidence, bewijs) blijft **altijd** zichtbaar, ongeacht of de AI-laag beschikbaar is. Dit gedrag is niet gewijzigd deze sessie; er is geen nieuwe dedicated testfile voor toegevoegd (zie punt 16 — bestaand, ongewijzigd gedrag, geen nieuwe Fase 3-code).

Het Dashboard Coach-pad maakt **structureel geen enkele AI-aanroep** — dat is niet "fallback"-gedrag maar een architecturale garantie (zie punt 7).

---

## 12. Security/RLS-analyse

- **`dashboard_coach_insights`**: full CRUD RLS scoped op `profile_id = auth.uid()` — een speler kan uitsluitend zijn eigen rijen lezen/schrijven, ook al gebeurt de schrijfactie via de normale (niet service-role) sessie.
- **`refreshDashboardCoach`-server action**: `userId` komt uitsluitend van `requireUser()` (server-derived), nooit van client-input — een speler kan dus nooit andermans inzichten forceren te herberekenen.
- **Card Coach ownership-splitsing**: hergebruikt Fase 2's `batchGetCardAvailability`, die zelf al binnen de league-grens van de ingelogde speler werkt (`auth.uid()` via `requireUser()` in de aanroepende server component) — geen enkele nieuwe query in deze sessie omzeilt dat.
- **Deck Doctor-queries**: beide nieuwe `card_mechanics`-queries lezen uitsluitend publieke referentiedata (RLS: select-only voor `authenticated`, zoals in Fase 1 vastgesteld) — geen privacygevoelige data hierin.
- Geen enkele nieuwe query in deze sessie gebruikt of vereist een service-role key in clientcode.

---

## 13. Performance/query-analyse

| Onderdeel | Queries | N+1? | Volledige-scan-risico? |
|---|---|---|---|
| Card Coach (per kaartdetailpagina, alleen bij open-klikken) | 1× `card_instances` (ownership) + 1× hergebruikte profiel-lookup + ≤3 `card_synergy_edges`-lookups (packages, ≤6 owned-ids) | Nee | Nee — top-N kandidaten al vooraf beperkt door Fase 1's candidate-generatie |
| Dashboard Coach (verse cache) | 1× `dashboard_coach_insights` select | Nee | Nee |
| Dashboard Coach (stale/refresh) | +1× deck_cards, +1× card_instances, +1× card_catalog, +1× card_mechanics (elk `.in()`-bounded), +1× upsert, optioneel +1× delete | Nee | Nee |
| Deck Doctor-paneel | +2× `card_mechanics` (deck-kaarten bounded; owned-kandidaten vooraf `.overlaps()`-gefilterd) | Nee | Nee |

Geen enkel nieuw pad doet een AI-aanroep tijdens render of navigatie; Dashboard Coach doet dat structureel nooit. Geen enkel nieuw pad haalt de volledige catalogus of de volledige collectie op.

---

## 14. Tests

| Bestand | Scenario's | Status |
|---|---|---|
| `card-synergy-candidates.test.ts` (nieuw) | same-archetype-only exclusie, echte reden + archetype inclusie met bewijs, Master Duel forbidden-exclusie, strikte ownership-splitsing, 5× `deriveConfidence`-tiering | 9/9 hand-geverifieerd via Node-smoke-script (vitest draait niet in deze sandbox — zie punt 15) |
| `dashboard-coach.test.ts` (nieuw, uitgebreid) | fingerprint-determinisme/-gevoeligheid (4), finding-mapping incl. default-branch en 2 regressietests voor de naam-truncatie-bug (7), cache-hit-zonder-herberekening, fingerprint-mismatch-herberekening, league-isolatie, nooit-AI, lege-mechanics-geen-vals-"gezond" (6) | 17/17 hand-geverifieerd via Node-smoke-script |
| Bestaande `deck-doctor.test.ts`, `synergy-engine.mjs`-suite | ongewijzigd | niet opnieuw hand-uitgevoerd deze sessie (geen wijziging aan die bestanden) |

**Twee echte bugs gevonden tijdens hand-verificatie (niet cosmetisch — beide waren fouten in productiecode die pas zichtbaar werden door de kandidaat-testwaarden tegen de echte productiegewichten te leggen):**

1. `deriveConfidence` gebruikte een harde `topWeight >= 20`-drempel voor Middel-confidence. De productiegewichten (`WEIGHT.materialType = 15`) vielen daaronder, waardoor een échte, enkelvoudige mechanische reden ("dit is een geldig Xyz-materiaaltype") ten onrechte als Laag werd gegradeerd — hetzelfde niveau als "geen bewijs". Fix: elke niet-zwakke reden telt al als minstens Middel.
2. `findingToDashboardInsight` extraheerde de kaartnaam voor UNSUPPORTED_EXTRA_DECK_CARD via `summary.split(" ")[0]` — dit knipt elke meerwoordige kaartnaam af ("Elemental HERO Sparkman" → "Elemental"), wat de overgrote meerderheid van Yu-Gi-Oh-kaarten betreft. Fix: een echte `card_catalog_id → naam`-lookup meegegeven vanuit de al-opgehaalde deckkaarten, met twee nieuwe regressietests (volledige naam behouden; nette fallback zonder lookup-map).

Niet toegevoegd deze sessie: een dedicated testfile voor de "AI: onbekende kaart geweigerd / time-out / malformed output / provider-unavailable / geen AI-aanroep tijdens render"-categorie uit de opdracht. Dit is **bestaand, ongewijzigd gedrag** in `card-synergy.ts`/`boss-companion.ts` dat al vóór Fase 3 dit contract implementeerde — geen nieuwe Fase 3-code. Aanbevolen als kleine vervolgstap, niet als kritieke blocker.

---

## 15. typecheck/lint/test/build-status

Uitgevoerd **op het daadwerkelijke Mac-apparaat** via de device-bridge (niet aangenomen):

| Commando | Resultaat |
|---|---|
| `npx tsc --noEmit -p .` | **EXIT 0** — schoon, na elke wijziging opnieuw bevestigd |
| `npx eslint .` (volledig project) | **EXIT 0** — schoon |
| `npm test` (vitest) | **FAALT** — `Cannot find module '@rollup/rollup-linux-arm64-gnu'`. De device-bridge-shell draait in een geïsoleerde linux/arm64-sandboxlaag, niet letterlijk macOS Terminal; native rollup/SWC-binaries voor dat platform zijn niet geïnstalleerd. Onafhankelijk herbevestigd deze sessie (niet aangenomen uit Fase 1/2). |
| `npm run build` | **FAALT** — `Failed to load SWC binary for linux/arm64`, exact dezelfde oorzaak. |

**Dit is geen "doe alsof het slaagt"-rapportage.** Omdat vitest niet draait, is elke nieuwe testsuite **hand-geverifieerd** door de exacte scenario's uit de echte `.test.ts`-bestanden over te zetten naar een los `node --experimental-strip-types`-script (Node 22.6+, geen vitest nodig) met de `@/`-pad-aliassen vervangen door relatieve imports naar de ongewijzigde brondbestanden — zie punt 14 voor resultaten (26/26 gepasseerd in totaal). Dit is dezelfde aanpak als Fase 1/2 voor pure functies gebruikte.

**Voor de gebruiker om zelf op de Mac (buiten deze sandbox) uit te voeren, ter definitieve bevestiging:**
```
npm run typecheck   # of: npx tsc --noEmit -p .
npm run lint
npm test
npm run build
```

---

## 16. Bekende beperkingen

- De optionele AI-uitleglaag specifiek voor Deck Doctor-findings en 2/3-kaart-interacties is niet gebouwd (zie punt 10).
- Geen dedicated nieuwe testfile voor het bestaande AI-fallbackcontract (zie punt 14, laatste alinea) — wel functioneel ongewijzigd en al eerder werkend.
- Dashboard Coach beperkt zich tot 4 inzichttypes afgeleid van het actieve deck's eigen Deck Doctor-report; de opdracht noemt ook collectie-brede categorieën (nieuw beschikbare synergie over de hele collectie, een ongebruikt owned package, een brede trade-scan, een collectie-gat) — elk zou een eigen bounded/indexed queryontwerp nodig hebben en is bewust **niet** gebouwd binnen deze sessie (zie het modulehoofd van `dashboard-coach.ts`).
- Card Coach's "conflicts/unmet requirements"-subfeature (één van de MY CARDS-bullets uit de opdracht) is niet gebouwd — te complex om correct binnen de resterende tijd op te leveren; bewust uitgesteld in plaats van half gebouwd.
- `npm test`/`npm run build` kunnen in deze sandbox niet worden bevestigd (native-binary-platformmismatch) — zie punt 15 voor het exacte, herhaalbare bewijs en de commando's voor de gebruiker.
- De mechanics-pipeline is nog niet daadwerkelijk tegen productie uitgevoerd — deze sandbox heeft geen netwerktoegang tot productie-Supabase (zie punt 19).

---

## 17. Uitgesteld naar Fase 4

1. Optionele AI-uitleglaag (Sectie 6 van de opdracht) — "Vraag Coach"/"Leg deze combinatie uit"-acties, hergebruik van de bestaande providerarchitectuur voor Deck Doctor-findings en 2/3-kaart-interacties.
2. Collectie-brede Dashboard-inzichtcategorieën (newly-available synergy, unused owned package, brede trade-opportunity-scan, collection gap).
3. Card Coach's "conflicts/unmet requirements"-subfeature.
4. Dedicated testfile voor het bestaande AI-fallbackcontract (unknown-card-rejected/time-out/malformed/provider-unavailable), als losstaande documentatie van reeds-werkend gedrag.
5. Daadwerkelijke uitvoering van de mechanics-populatiepipeline tegen productie (zie punt 19/20).

---

## 18. Lokale commits (niet gepusht)

```
3961195 feat: integrate deterministic deck doctor
9b357b3 feat: add cached dashboard coach
a89ed52 feat: add ownership-aware card coach
b148a19 feat: operationalize card mechanics pipeline
```

4 commits, 11 bestanden, 2083 regels toegevoegd / 54 verwijderd (`git diff --stat 8143ee2..3961195`). Bovenop de Fase 2-commits (`8143ee2` t/m `bd65f0d`), zelf ongewijzigd. **Niet gepusht**, conform opdracht.

Ter info, buiten scope van deze sessie: de working tree bevatte bij aanvang al ongerelateerde, niet-gecommitte wijzigingen (`src/app/(app)/admin/page.tsx`, `src/app/actions/admin.ts`, `supabase/migrations/202608220020_master_duel_compatibility.sql`, `202608231520_season_reset.sql`, `tsconfig.tsbuildinfo`, en meerdere ongetrackte `202608231530`–`580`-migraties rond season-reset/bossg-test-overrides). Deze zijn **niet aangeraakt, niet gecommit, niet gewijzigd** deze sessie — expliciet buiten de Fase 3-scope gelaten zodat elke commit hierboven zuiver Fase 3-werk bevat.

---

## 19. Exacte veilige productie-deploysequentie

1. `git push` de 4 commits hierboven naar de gewenste branch (niet door deze sessie uitgevoerd).
2. Deploy de nieuwe migratie: `supabase db push` (of het bestaande CI/CD-migratiepad) — voegt alleen de nieuwe `dashboard_coach_insights`-tabel + RLS-policies toe, raakt geen bestaande tabel aan.
3. Deploy de applicatiecode (Vercel/hosting-pijplijn naar keuze) — bevat de nieuwe Coach-UI, die zichzelf overal eerlijk als "nog niet geanalyseerd" toont zolang stap 4 niet is uitgevoerd.
4. **Vul `card_mechanics`/`card_synergy_edges` daadwerkelijk**, vanaf een omgeving met netwerktoegang tot productie-Supabase (niet deze sandbox):
   ```
   node scripts/compute-synergy-graph.mjs --write --incremental
   ```
   Eerst een dry-run (zonder `--write`) ter controle van de counts wordt aangeraden. Dit commando is idempotent en veilig herhaalbaar; met `--incremental` kan het ook periodiek (bv. na elke catalogus-update) opnieuw draaien zonder onnodig alle 14k+ kaarten te herberekenen.

---

## 20. Commando dat nog moet draaien om productie-intelligentie te vullen

```
node scripts/compute-synergy-graph.mjs --write --incremental
```

**Dit is deze sessie niet uitgevoerd tegen productie** — de sandbox heeft geen netwerktoegang tot productie-Supabase, onafhankelijk herbevestigd deze sessie via een directe `fetch`-test tegen de Supabase REST-root (`NETWORK ERROR: fetch failed`). Zonder deze stap blijft `card_mechanics` leeg en toont elke nieuwe Coach-sectie eerlijk zijn "nog niet geanalyseerd"-status — geen enkel onderdeel doet alsof er data is wanneer die er niet is.

---

## 21. Productiegereedheid: **PARTIAL**

**Niet PASS**, precies om de reden die de opdracht zelf benoemt: "Do not call PASS merely because UI renders. The deterministic intelligence data must actually be operational." De volledige Coach-UI (Card Coach, Dashboard Coach, Deck Doctor-paneel) is gebouwd, typecheck/lint-schoon, en de nieuwe logica is 26/26 hand-geverifieerd — maar `card_mechanics` is in productie nog altijd leeg, en zonder die data toont elke Coach-sectie terecht zijn eerlijke "nog niet geanalyseerd"-status in plaats van echte aanbevelingen. Het product is dus **functioneel compleet en correct**, maar **operationeel nog niet actief** totdat punt 19/20 buiten deze sandbox wordt uitgevoerd.

**Niet FAIL**: geen enkele hard-constraint is geschonden (geen push, geen deploy, geen productie-aanraking, geen dataverlies, alleen additieve migraties), typecheck en lint zijn schoon, en elk nieuw stuk logica is — voor zover in deze sandbox mogelijk — daadwerkelijk geverifieerd, inclusief twee gevonden-en-gefixte echte bugs.

**PARTIAL** is dus de eerlijke, opdracht-conforme beoordeling: de bouw is klaar, de activering (stap 19/20, buiten deze sandbox) staat nog open.

---

*Gegenereerd autonoom, Fase 3, 24 augustus 2026. Geen push, geen deploy, geen productie-aanraking.*
