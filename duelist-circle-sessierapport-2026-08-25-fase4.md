# Duelist Circle — sessierapport 2026-08-25 (fase 4)

Autonome vervolgsessie op verzoek van de gebruiker: audit + bugfixes + architectuurherziening van de synergy-opslag + gerichte polish van Duelist Coach, zonder te pushen of te deployen en zonder productiedata handmatig te wijzigen. Dit rapport volgt de 25 gevraagde punten.

## 1. Beginstatus van de repository

`git log` stond op commit `5ef601e` ("fix: preserve season reset and draft concurrency hardening"), bovenop de fase 1–3 geschiedenis (card mechanics pipeline, ownership-aware card coach, cached dashboard coach, deterministic deck doctor). `git status --short` toonde alleen de gebruikelijke build-artefacten (`next-env.d.ts`, `tsconfig.tsbuildinfo`) als gewijzigd — geen onafgemaakt werk van de gebruiker zelf. Databasecontext zoals opgegeven: `card_synergy_edges` leeg (na opruiming van een eerdere overproductie van 1.461.604 rijen), `card_mechanics` intact, database weer schrijfbaar, Supabase Pro actief. Deze sessie heeft die databasecontext op geen enkel moment via een live verbinding kunnen bevestigen — de sandbox heeft geen netwerktoegang tot het echte Supabase-project (bevestigd via een expliciete `curl`-test die een `403 host_not_allowed` teruggaf) — en heeft dus uitsluitend op de opgegeven beschrijving en op de code/migraties zelf vertrouwd.

## 2. Gevonden bugs

- **A1**: `purchase_shop_rotation_card` sloeg `card_instances.league_id`, `original_owner_id` en `original_acquisition_type` nooit op, terwijl alle drie `not null` zijn — elke aankoop van een los kaartje moest daardoor mislukken.
- **A4**: een speler kon een vergrendelde competitiedeck alsnog bewerken via de sluiproute deactiveren → `markDeckDraft` → bewerken → (optioneel) heractiveren, omdat er geen enkel mechanisme bestond dat een deck aan een gestarte competitie koppelde.
- **Track B**: de vorige synergy-precompute genereerde volledige cross-products over tag-buckets (`gySetup × gyPayoff`, `discardOutlet × gyPayoff`, `banishSetup × banishPayoff`) — de bevestigde oorzaak van de 1.461.604 rijen.
- **Track E**: de deckbuilder-pagina is een servercomponent; elke toevoeging/verwijdering van een kaart deed een volledige server-rerender met ~6 Supabase-round-trips, terwijl de samenstellingstellingen (Main/Extra/Monster/Spell/Trap) puur en synchroon client-side te berekenen zijn — een directe schending van de expliciete performance-eis.

## 3. Grondoorzaak van de mislukte shopaankoop

Getraceerd van UI-formulier (`src/app/(app)/shop/page.tsx`) via de serveraction (`purchaseRotationCard` in `src/app/actions/shop.ts`) naar de RPC (`purchase_shop_rotation_card`, oorspronkelijk gedefinieerd in `20260820_shop_system.sql` en nooit bijgewerkt). De RPC liet `league_id`, `original_owner_id` en `original_acquisition_type` weg uit de `card_instances`-insert. Omdat die kolommen `not null` zijn (`202608190004_card_instances.sql`), en omdat de `validate_new_card_instance`-trigger zijn schaarste- en lidmaatschapscontroles scoped op `new.league_id`, faalde elke aankoop óf op een NOT NULL-constraint óf op de trigger-exception "Current owner is not a member of this league." Een tweede bug: `next_copy_number` werd berekend zonder `league_id`-filter, terwijl kopienummers per league uniek moeten zijn. Beide zijn gefixt in een nieuwe migratie die het al-werkende `purchase_shop_pack`-patroon spiegelt.

## 4. Shop-refresh implementatie

Onderzocht en **correct bevonden, geen wijzigingen nodig**. `ensure_shop_rotations_current()` wordt bij elke `/shop`-paginalading aangeroepen, gebruikt `pg_advisory_xact_lock` voor concurrency-veiligheid, en een goedkope `exists()`-check zorgt dat het normale pad (geen refresh nodig) nooit een dure scan doet. `ShopCountdown` toont een live aftelling op basis van het echte `ends_at`. Dit voldoet aan alle gestelde eisen zonder aanpassing.

## 5. Wijzigingen aan kaartvisuals/overlays (Track A3)

Uitgevoerd door een subagent, geverifieerd met `npm run typecheck`/`npm run lint` op het echte apparaat. Gewijzigde bestanden: `deck-collection-browser.tsx`, `trade-collection-browser.tsx`, `draft-choice-grid.tsx`, `pack-opening-reveal.tsx`, `decks/[id]/page.tsx` (`DeckCardTile`), `deck-action-button.tsx`. Overlays (zeldzaamheidschip, Master Duel-badge, aantal-badge, "For Trade"/"Not legal"-badges, verwijderknop) lagen eerder over de naam (bovenkant) of ATK/DEF (rechtsonder) van de kaartafbeelding; deze zijn verplaatst naar een strook onder de afbeelding. `src/app/(app)/cards/collection/page.tsx` bleek al in een eerdere sessie (`b63fc7e`) correct gefixt en is niet aangeraakt. **Kanttekening**: er is geen visuele screenshot/render gedaan — geen dev-server/build beschikbaar in deze sandbox — de fix is beredeneerd via de bestaande Tailwind-klassen en het reeds-gefixte collectiepatroon.

## 6. Implementatie van de competitie-deckvergrendeling (Track A4)

Nieuwe migratie `202608250930_competition_deck_lock.sql`, volledig additief. Omdat de daadwerkelijke SQL-bodies van 8 competitie-RPC's (waaronder `start_competition`, `add_competition_player`) niet in deze repository aanwezig zijn en uitsluitend live in productie bestaan (expliciet gedocumenteerd in `202608231045_competition_schema_recovery.sql`), is er bewust **niet** `create or replace function` op die RPC's toegepast — dat zou onbekende, werkende logica kunnen overschrijven. In plaats daarvan: een nieuwe tabel `competition_deck_locks` (één permanente rij per competitie+speler, vastgelegd zodra de competitiestatus `draft` verlaat) plus vier nieuwe triggers op bekende tabellen (`competitions`, `competition_players`, `deck_cards`, `decks`) die vuren ongeacht welke (bekende of onbekende) functie de onderliggende INSERT/UPDATE veroorzaakt. Resultaat: kaarten van een vergrendeld deck zijn onwijzigbaar, status/`is_active` van dat deck zijn onwijzigbaar, en overstappen naar een ander deck is geblokkeerd zolang de competitie `active` is — maar zodra de competitie `completed`/`cancelled` is, mag de speler weer een ander deck activeren (het vergrendelde deck blijft voor altijd bevroren, voor reproduceerbaarheid).

## 7. Herontwerp van de synergy-opslag (Track B)

`scripts/compute-synergy-graph.mjs`: de cross-product-pass (voorheen "Pass C") die `gy_setup`/`gy_payoff`/`discard_outlet`/`banish_setup`/`banish_payoff`-buckets volledig tegen elkaar kruiste, is **volledig verwijderd** — dit was de bevestigde oorzaak van de explosie. `material_supply_constrained` (Pass B) en `spell_trap_support` (nu Pass C) zijn behouden maar begrensd met een nieuwe `MAX_CANDIDATES_PER_SOURCE = 40`: een bron waarvan de kandidatenset breder is dan dat, wordt als "te generiek om te persisteren" overgeslagen (blijft waar en berekenbaar, wordt alleen niet opgeslagen). Een harde `SAFE_EDGE_CEILING = 100.000` weigert elke schrijfactie als het totaal aantal edges die grens ooit overschrijdt — verdediging in de diepte tegen een toekomstige regressie. De verwijderde GY/discard/banish-relaties zijn niet verloren: `src/lib/ai/card-synergy-context.ts` heeft een nieuwe, begrensde `supplementWithOwnedContextualEdges`-stap die exact dezelfde `computeSynergyEdges()` (uit `lib/synergy-engine.mjs`) live aanroept, maar uitsluitend tegen de eigen bezittingen van de kijkende speler (nooit de catalogus), begrensd op `OWNED_CANDIDATE_SUPPLEMENT_CAP = 150` kaarten. `graphComputed` wordt nog steeds uitsluitend op basis van de gepersisteerde graaf bepaald, zodat de "nog niet geanalyseerd"-status eerlijk blijft.

## 8. Wijzigingen aan Card Coach

Geen functionele wijzigingen deze sessie — een read-only audit bevestigde dat de drie modi (MY CARDS/DISCOVER/TRADE TARGETS) al correct gescheiden zijn, dat archetype-only-matches al expliciet worden uitgesloten, en dat bewijs al gegrond is in echte kaarttekst/mechanics. Gevonden hiaten (niet opgelost, zie punt 23): de regex-tags in `card-mechanics.ts` zijn ondiep (missen bv. banish-based search, "discard your entire hand"), en de kandidatenscoring in `card-synergy-candidates.ts` gebruikt geen starter/extender/NS-competitie-redenering.

## 9. Package-detectie

Geen nieuwe functionaliteit toegevoegd. `findOwnedPackages` in `card-synergy-context.ts` bestaat en detecteert echte driehoeken in de gepersisteerde graaf, maar uitsluitend als bijproduct van het bekijken van één specifieke kaart, begrensd tot 2 packages, zonder een van-collectie-brede standalone detectiefunctie. Bewust gedocumenteerd als vervolgwerk (punt 23).

## 10. Wijzigingen aan de deckbuilder (Track E)

Uitgevoerd door een subagent (model: Opus, gezien de complexiteit), geverifieerd met typecheck/lint op het apparaat. Nieuwe clientcomponenten `src/components/deck-live-composition.tsx` (gedeelde context, geseed met de servergegevens, herberekent `computeDeckComposition()` puur lokaal) en `src/components/deck-composition-summary.tsx` (Monster/Spell/Trap-paneel, nu gevoed vanuit de context). Alle Main/Extra-tellers in `decks/[id]/page.tsx` lezen nu de live waarde. Bewust **geen** `useOptimistic` gebruikt (dat zou de progressive-enhancement serveraction-vorm hebben vervangen); in plaats daarvan een `onSubmit`-handler die de lokale mutatie toepast, gereconcilieerd via een per-server-render-token zodat zowel een succesvolle als een mislukte serveractie de lokale staat correct terugzet. Deck Doctor en Master Duel-exportlogica blijven server-gerenderd (bewust, buiten scope — vereist `card_mechanics`-data die nu niet naar de client wordt gestuurd).

## 11. Wijzigingen aan Deck Doctor

`src/lib/deck-doctor.ts`: vier nieuwe bevindingen toegevoegd — `BRICK_RISK`, `INSUFFICIENT_INTERACTION`, `TOO_FEW_SEARCH_TARGETS`, `SPELL_TRAP_BALANCE` — elk met een gedocumenteerde, aanpasbare drempelwaarde. Elke bevinding heeft nu een verplicht `kind: "structural" | "heuristic"`-veld, zodat een feitelijke constatering ("0 Fusion-toegangskaarten") niet langer dezelfde `confidence`-schaal deelt als een afgewogen suggestie. `UNSUPPORTED_EXTRA_DECK_CARD` controleert nu ook Synchro/Link naast Fusion/Xyz.

## 12. Wijzigingen aan de collectie

Geen wijzigingen nodig — audit bevestigt dat `groupByArchetype` (`src/lib/collection.ts`) strikt op de echte `archetype`-kolom groepeert (nooit op naam-substring), een Generic/Other-bucket bestaat, en `fetchOwnedCollection` een vaste, begrensde reeks van 4 queries gebruikt zonder N+1-patroon.

## 13. Wijzigingen aan Dashboard Coach

Geen wijzigingen deze sessie. Audit bevestigt: geen enkele AI-aanroep, caching via een echte fingerprint (SHA256 over engine-versie + deck-id + gesorteerde kaart-id's, niet tijdgebaseerd), vier bevindingtypes geïmplementeerd. De twee ideale categorieën "these cards work together" en "trade target" ontbreken nog (al eerder in de modulekop als bewust uitgesteld gedocumenteerd) — niet toegevoegd deze sessie, zie punt 23.

## 14. Status van de AI-uitlegslaag

Audit bevestigt: geen AI-aanroep bij een normale paginalading (start altijd in `status: "idle"`, alleen op expliciete knopklik), een 30-minuten in-memory cache, en een hard afgedwongen anti-hallucinatie-contract (de AI krijgt uitsluitend vooraf berekende bewijsregels + echte kaartvelden, elk teruggegeven `cardId` dat niet in de oorspronkelijke kandidatenset zit wordt genegeerd, een deterministische fallback-uitleg is altijd beschikbaar). Wel een hiaat: geen gedeelde AI-provider-abstractie — `card-synergy.ts` en `boss-companion.ts` dupliceren elk hun eigen Anthropic-aanroep. Niet gefixt deze sessie (zuivere refactor, geen gebruikersimpact, zie punt 23).

## 15. Performance-/query-audit

Belangrijkste bevinding was Track E (hierboven opgelost). Verder bevestigd: `card-synergy-context.ts` was al goed beschermd tegen catalogus-brede scans (`EDGE_QUERY_CAP = 60`, nu ook `OWNED_CANDIDATE_SUPPLEMENT_CAP = 150`), `ownership-intelligence.ts` gebruikt één batched query ongeacht kandidaataantal, en `collection.ts`/`dashboard-coach.ts` tonen geen N+1-patronen.

## 16. Aangemaakte databasemigraties

- `supabase/migrations/202608250900_fix_shop_rotation_card_purchase.sql` — herstelt `purchase_shop_rotation_card` (A1).
- `supabase/migrations/202608250930_competition_deck_lock.sql` — voegt de competitie-deckvergrendeling toe (A4).

Beide zijn **niet toegepast op productie** — dat is uitdrukkelijk aan de gebruiker (zie punt 24).

## 17. Toegevoegde/gewijzigde tests

- `src/lib/deck-doctor.test.ts` — 8 nieuwe testgevallen (BRICK_RISK, INSUFFICIENT_INTERACTION, TOO_FEW_SEARCH_TARGETS, SPELL_TRAP_BALANCE inclusief false-positive-bescherming, Synchro/Link-ondersteuning, en een test dat elke bevinding een `kind` blootlegt).
- `src/lib/ai/dashboard-coach.test.ts` — bestaande testhelper aangepast voor het nieuwe verplichte `kind`-veld (anders brak de typecheck).
- `scripts/manual-verification/verify-a1-shop-purchase.sql` en `verify-a4-competition-deck-lock.sql` — nieuwe, zelfstandige, `BEGIN...ROLLBACK`-verpakte verificatiescripts (zie punt 24) omdat deze sandbox geen netwerktoegang tot een echte Postgres/Supabase-instantie heeft.
- De onderliggende deterministische logica voor test-items 12/13/14 (GY setup/payoff, discard outlet/payoff, banish setup/payoff) was al gedekt in `lib/synergy-engine.regression.test.mjs`; de nieuwe contextuele I/O-laag zelf is bewust niet apart gemockt, consistent met de reeds bestaande conventie in deze codebase (zie `ownership-intelligence.test.ts`'s eigen commentaar: alleen de pure logica wordt unit-getest, de I/O-orkestratielaag niet).

## 18. Exact typecheck-resultaat

`npm run typecheck` (= `tsc --noEmit`), uitgevoerd op het echte apparaat (niet de sandbox-kopie, die geen `node_modules`/`tsconfig.json` heeft) na elke wijziging: **geen enkele fout**, laatste bevestiging na de allerlaatste commit.

## 19. Exact lint-resultaat

`npm run lint` (= `eslint .`), eveneens op het echte apparaat: **geen enkel probleem**.

## 20. Exact testresultaat

`npx vitest run` (ook los geprobeerd voor `src/lib/deck-doctor.test.ts` alleen) faalt **niet door deze sessie's wijzigingen**, maar door een omgevingsprobleem: `Cannot find module '@rollup/rollup-linux-arm64-gnu'` (een bekende npm optional-dependencies-bug). Een poging om het ontbrekende pakket alsnog te installeren gaf `403 Forbidden` terug van de npm-registry — deze sandbox heeft domweg geen netwerktoegang. Dit is dezelfde, al eerder gedocumenteerde beperking uit fase 1–3. **Geen enkele testrun is dus daadwerkelijk uitgevoerd deze sessie.**

## 21. Exact productiebuild-resultaat

Niet uitgevoerd, om dezelfde reden als punt 20 (dezelfde toolchain/afhankelijkheden). Niet geprobeerd, om geen tijd te verspillen aan een poging die naar verwachting op hetzelfde platformprobleem stuit.

## 22. Aangemaakte git-commits

Alle lokaal, **niet gepusht**, in deze volgorde bovenop `5ef601e`:

1. `b0b4071` — fix: repair shop loose-card purchase and lock competition decks
2. `bd7bfb8` — refactor: bound synergy precompute, restore GY/discard/banish via context
3. `178f45e` — fix: stop card-tile badges from covering printed name/ATK/DEF
4. `be37181` — feat: expand Deck Doctor findings and structural/heuristic labeling
5. `f2b16d7` — perf: update deck composition counts instantly on the client
6. `67edc9e` — docs: add manual verification scripts for A1 and A4

## 23. Bewust uitgesteld werk

- **Track C**: diepere mechanische redenering in Card Coach (starter/extender/NS-competitie-bewustzijn in de kandidatenscoring, bredere regex-dekking voor protectie/floodgate/bredere discard-patronen).
- **Track D**: een collectiebrede, standalone package-detectiefunctie (los van het bekijken van één kaart).
- **Track H**: de twee ontbrekende Dashboard Coach-categorieën ("these cards work together", "trade target").
- **Track I**: samenvoegen van de gedupliceerde AI-provider-code in `card-synergy.ts`/`boss-companion.ts` tot één gedeelde abstractie.
- Visuele/pixel-verificatie van de Track A3-overlaywijzigingen (geen dev-server/browser beschikbaar in deze sandbox).
- Daadwerkelijke uitvoering van beide nieuwe migraties en de bijbehorende verificatiescripts tegen een echte database (geen netwerktoegang).
- `npm test`/`npm run build` daadwerkelijk laten slagen in déze sandbox (omgevingsbeperking, niet dit sessie's wijzigingen).

Deze keuzes zijn gemaakt omdat A1/A4/Track B (databaseveiligheid, de expliciet genoemde 1,46M-rij-episode) en Track E (expliciete performance-eis) de hoogste, met naam genoemde risico's/eisen uit de opdracht direct raken; Tracks C/D/H/I zijn waardevolle verbeteringen maar geen bugfixes of geschonden harde eisen.

## 24. Exacte handmatige stappen voor de gebruiker

1. Pas beide nieuwe migraties toe op een **staging/dev**-Supabase-project (nooit rechtstreeks op productie zonder eerst te testen): `202608250900_fix_shop_rotation_card_purchase.sql` en `202608250930_competition_deck_lock.sql`.
2. Draai `scripts/manual-verification/verify-a1-shop-purchase.sql` en `verify-a4-competition-deck-lock.sql` tegen die staging-database (elk script heeft één plaatsvervanger nodig: een echt `profiles.id`) en lees de PASS/FAIL-`NOTICE`-regels.
3. `card_synergy_edges` is nog steeds leeg. Draai `node scripts/compute-synergy-graph.mjs` (dry run, geen `--write`) tegen diezelfde staging-database, lees `reports/synergy-graph/<tijdstempel>/REPORT.md`, en pas pas daarna `--write` toe als de edge-aantallen er verstandig uitzien (met de nieuwe begrenzingen zou dit orde-groottes kleiner moeten zijn dan de vorige 1,46M).
4. Draai `npm test` en `npm run build` op een normale (niet-gesandboxte) machine om een echte testrun/build te krijgen — dat kon in deze sessie niet.
5. Bekijk de Track A3-overlaywijzigingen visueel in de browser (collectie, deckbuilder, "Mijn Deck"-grid) op verschillende schermgroottes — dit is beredeneerd maar nooit gerenderd.
6. Overweeg de in punt 23 genoemde uitgestelde items voor een volgende sessie.
7. Pas pas daarna `git push` toe, wanneer bovenstaande stappen zijn gecontroleerd.

## 25. Eindoordeel

**PARTIAL.** Typecheck en lint zijn schoon, de code is zorgvuldig getraceerd en beredeneerd, de 1,46M-rij-episode kan met het nieuwe ontwerp niet opnieuw ontstaan, en de belangrijkste met naam genoemde bugs (A1, A4) zijn met een concrete, geverifieerde-voor-zover-mogelijk fix opgelost. Maar conform de expliciete instructie "Do not call the work PASS unless the important user-facing flows are actually verified": de shopaankoop- en competitie-vergrendelingsflows zijn **niet** tegen een echte database geverifieerd (geen netwerktoegang in deze sandbox), en `npm test`/`npm run build` zijn geen van beide daadwerkelijk gedraaid. Dat maakt dit rapport eerlijk PARTIAL, niet PASS — de stappen in punt 24 zijn nodig voordat dit als volledig geverifieerd mag gelden.
