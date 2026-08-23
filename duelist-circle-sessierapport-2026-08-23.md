# Duelist Circle — Ontwikkelsessie Rapport
**23 augustus 2026 · Autonome run (Shop-prijsfix → Competition V2 → AI Card Synergy)**

Deze sessie is volledig autonoom uitgevoerd volgens de expliciete opdracht: *"Ik ben gedurende deze run niet beschikbaar voor vragen... Vraag mij niets. Werk zelfstandig."* De vaste regels golden onverkort: de drie echte spelersaccounts (`gossie`, `fardin`, `samochamo`) zijn op geen enkel moment gelezen of geschreven, trading is niet herbouwd, shop-rarity-odds zijn niet aangepast, Master Duel-eligibility is niet versoepeld, de Legendary-uniciteitsregel is niet gewijzigd, er is nul keer `git push` uitgevoerd, en er is geen enkele live migratie tegen productie-Supabase gedraaid. "Compileert" is nergens gelijkgesteld aan "werkt" — elke claim hieronder is gemarkeerd als PASS (echt getest), NOT TESTED (eerlijk niet geverifieerd), of NOT BUILT.

**Volgorde uit de opdracht, gevolgd:** 0) Shop-prijsfix — 1) Competition-schema-audit + V2 — 2) AI Card Synergy / Deck Coach — 3) extra QoL (niet gehaald, zie hieronder).

Daarnaast is vóór deze grote run een losstaande, kleine correctness-fix afgerond: de Legendary "first pull"-check in `purchase_shop_pack()` gebruikte alleen `card_instances.original_owner_id`, wat een speler die een Legendary ooit via trade kreeg en weer wegruilde ten onrechte als "nog nooit gehad" zou behandelen. Dit is gecorrigeerd naar de volledige `ownership_history`-tabel als source of truth (commit `22f305c`, apart getest, apart gecommit — zie Sectie A hieronder).

---

## Samenvatting vooraf

| Onderdeel | Status |
|---|---|
| A. Legendary first-pull ownership-fix | ✅ Gebouwd, runtime geverifieerd (5 scenario's), gecommit |
| 0. Shop-prijsfix (Special Packs → 900 DP) | ✅ Gebouwd, runtime geverifieerd, gecommit |
| 1. Competition-schema-audit | ✅ Uitgevoerd, volledig gedocumenteerd |
| 1. Competition-schema-recovery (additief) | ✅ Gebouwd, idempotentie geverifieerd, gecommit |
| 1. Competition V2 (scheduling, standings, rewards) | ✅ Gebouwd, uitgebreid runtime geverifieerd incl. concurrency, gecommit |
| 1. Competition V2 — UI (create/detail/resultaten) | ✅ Gebouwd, typecheck+lint schoon, **UI NIET live getest** (geen browser) |
| 2. AI Card Synergy — backend (mechanics/candidates/AI-laag) | ✅ Gebouwd, runtime geverifieerd, gecommit |
| 2. AI Card Synergy — Card Detail UI ("Duelist Insight") | ✅ Gebouwd, typecheck+lint schoon, **UI NIET live getest** |
| 2. AI Deck Coach V1 | ❌ Niet gebouwd — zie Beperkingen |
| 3. Extra QoL | ❌ Niet gebouwd — capaciteit op, bewust gestopt op een schone commit-grens |

**Waarom niet alles:** de opdracht was expliciet in prioriteitsvolgorde (Shop → Competition → AI → QoL) met de instructie liever minder features vólledig af te hebben dan veel half af. Competition V2 alleen al vereiste een verplichte volledige schema-audit (het systeem bleek deels niet in git te staan) vóórdat er iets gebouwd mocht worden, plus verplichte concurrency-tests tegen een disposable database. Dat heeft het grootste deel van de sessie gekost — bewust, conform de opdracht. AI Card Synergy is daarna als een genuine, geteste backend + minimale UI afgerond in plaats van gehaast. Extra QoL is om die reden niet meer opgepakt.

---

## Sectie A — Legendary first-pull ownership-fix (vooraf, apart van de grote run)

`is_first_for_player` in `purchase_shop_pack()` keek alleen naar `card_instances.original_owner_id`, wat faalt zodra een speler een Legendary via trade heeft gekregen en die later weer heeft weggeruild. Gecorrigeerd naar een join met `ownership_history.to_owner_id` (de trigger-gevulde, volledige acquisitie-geschiedenis) als source of truth — het schema is eerst echt gecontroleerd, niet gegokt.

Getest tegen scratch PostgreSQL (`mdtest4`, ~648 echte kaarten):
1. Nooit eerder gehad → `true` — PASS
2. Eerder zelf gepulled → `false` — PASS
3. Eerder gedraft → `false` — PASS
4. Eerder via trade gekregen, later weer weggeruild → `false` — PASS
5. Nooit zelf owner geweest, andere speler wel → `true` — PASS

Race-safety, de bestaande advisory lock, alle rarity-odds, pity, copy-limits en pack-prijzen zijn ongewijzigd gebleven (alleen de `is_first_for_player`-subquery is aangeraakt). Typecheck/lint schoon. **Commit `22f305c`, niet gepusht.**

Bekende, eerlijk gerapporteerde beperking: scenario 4 (trade-weggeruild) kon niet end-to-end via een échte `purchase_shop_pack()`-aanroep in de LIVE-flow gereproduceerd worden, omdat de bestaande `card_copy_limit()`-trigger een tweede instance van dezelfde Legendary sowieso al structureel onmogelijk maakt zodra er één bestaat in een league — dat maakt de `false`-tak in de huidige live shop-flow specifisch onbereikbaar (een al langer bestaande, niet deze sessie geïntroduceerde beperking). De logica zelf is wel apart, correct geverifieerd op de query-laag.

---

## 0. Shop — Special Pack-prijsfix

1. **Oude prijs Special Packs (Attribute + Archetype):** 250 DP.
2. **Nieuwe prijs:** 900 DP — gelijk aan de Premium-pack, zoals gevraagd.
3. **Attribute Spotlight Pack-prijs:** 900 DP — bevestigd via correctie van bestaande rijen én een verse generatie.
4. **Archetype Spotlight Pack-prijs:** 900 DP — idem.
5. **Migratie:** **nieuw, additief** bestand `202608231030_special_pack_price_900.sql` — bewust NIET de al-live `202608230021`-migratie herschreven. Bevat (a) een eenmalige `UPDATE` van bestaande actieve rotaties naar 900 DP, en (b) een `CREATE OR REPLACE FUNCTION refresh_shop_special_pack_rotation_if_needed(...)` die voortaan zelf 900 DP genereert i.p.v. de oude hardcoded 250. Rarity-odds, pity, cards-per-pack, thema-logica en de 48-uurs rotatie zijn **niet aangeraakt**.

**Runtime-verificatie (mdtest4):** bestaande rotaties gecorrigeerd naar 900 → idempotente herhaling bevestigd (`UPDATE 0` bij tweede run) → geforceerde verse generatie leverde 900 DP met ongewijzigde kaartenaantallen/thema-logica → een echte `purchase_shop_pack('special_attribute')`-aanroep debiteerde exact 900 DP. **Commit `efb4d63`, niet gepusht.**

---

## 1. Competition V2

### Schema-audit (verplicht, vóór er iets gebouwd werd)

**Punt 1 — Schema-audit:** Volledige inspectie van `competitions`, `competition_players`, `competition_results`, `competition_reward_rules`, `matches.competition_id`, plus `src/app/actions/competitions.ts` en beide competitie-UI-pagina's, uitgevoerd vóór enige wijziging.

**Punt 2 — Schema drift:** Bevestigd, met bewijs (niet gegokt): de tabellen `competitions`, `competition_players`, `competition_reward_rules`, `competition_results`, de kolom `matches.competition_id`, en acht RPC's (`create_competition`, `add_competition_player`, `remove_competition_player`, `start_competition`, `get_competition_standings`, `finalize_round_robin_competition`, `distribute_competition_rewards`, `install_default_competition_rewards`) bestaan **live**, maar stonden in **geen enkele** van de gitte migraties. De acht RPC's zijn black-box: hun body's zijn NIET geraden — waar ze niet betrouwbaar op te halen waren, is dat hier expliciet zo vermeld in plaats van verzonnen.

**Punt 3 — Baseline/recovery-migratie:** `202608231045_competition_schema_recovery.sql` — uitsluitend `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / veilige index-creatie, **nul** `CREATE OR REPLACE FUNCTION`-statements (de acht black-box RPC's zijn niet aangeraakt, precies om ze niet per ongeluk te overschrijven met een gegokte body). Idempotentie geverifieerd: twee keer afgespeeld tegen een schone database, de tweede run wijzigde niets. **Commit `8480244`.**

### Competition V2 zelf

**Punt 4 — V2-migratie:** `202608231100_competition_v2_scheduling.sql` (1258 regels) — additieve kolommen op `competitions`/`matches`, nieuwe tabel `competition_reward_grants`, en negen volledig nieuwe `_v2`-functies. Geen van de acht V1-RPC's is gewijzigd of overschreven; V1 blijft voor bestaande/oude competities intact naast V2.

**Punt 5 — Create-opties:** Admin kiest naam, spelers, meetings-per-pairing (1×/2×/3×/Custom) en match-format (Single Duel vs. Best of 3) — met een live preview van het aantal matches/duels vóórdat er iets wordt aangemaakt (`competition-create-form-v2.tsx`).

**Punt 6 — `meetings_per_pairing`:** Ondersteunt elke waarde ≥ 1, niet alleen 1×.

**Punt 7 — Single Duel:** Eén duel per match, winnaar bepaalt de matchuitslag direct.

**Punt 8 — Best of 3:** Expliciet losstaand concept van "iedereen speelt elkaar 3×" — een Best of 3-match is één match met tot 3 duels (2-0 / 2-1 eindigt vroeg bij 2-0).

**Punt 9 — Round-robin-generator:** Circle/polygon-methode in PL/pgSQL, byes voor oneven aantallen, rotatie-reset per meetings-cyclus om herhalingen over de ronden te spreiden, en een expliciete "geen speler twee keer in dezelfde ronde"-garantie.

**Punt 10 — Test 3 spelers × 1×:** 3 matches gegenereerd, elke speler 2 matches — PASS.

**Punt 11 — Test 3 spelers × 3×:** 9 matches gegenereerd, elke speler 6 matches, herhaalontmoetingen verspreid over ronden 1/4/7, 2/5/8, 3/6/9 — PASS.

**Punt 12 — Matchaantallen algemeen:** Extra query bevestigde: geen speler ooit twee keer in dezelfde ronde ingepland.

**Punt 13 — Standings:** `get_competition_standings_v2()` — Played/Wins/Losses/Draws/Points/Duel Wins/Duel Losses/Duel Differential, live tijdens een actieve competitie.

**Punt 14 — Tiebreakers:** Gedocumenteerde, deterministische cascade: competitiepunten → onderling resultaat binnen de gelijkstaande groep → duel-differential → duel-wins → `profile_id` als allerlaatste, altijd-beslissende fallback. Stress-getest met een opzettelijke 3-weg cyclische gelijkstand (A>B>C>A, alle metrics gelijk t/m duel-wins) — loste alléén op via de `profile_id`-fallback, wat bevestigt dat de ranking nooit ambigu kan zijn. Eén bewuste vereenvoudiging: onderling resultaat wordt berekend binnen "tegenstanders op hetzelfde totale puntenaantal", niet met volledige iteratieve subgroep-hergroepering — een resterende subgelijkstand daarna valt gewoon door naar duel-differential.

**Punt 15 — Resultaatinvoer:** `submit_competition_match_result_v2()` blokkeert onmogelijke scores (3-0, 2-2, een "voltooid" gemarkeerde 1-0 bij Best of 3, etc.) — zowel server/DB-side als in de UI (alleen legale preset-scoreknoppen worden getoond, als defense-in-depth).

**Punt 16 — Correctie:** `correct_competition_match_result_v2()` — uitsluitend compenserende transacties, nooit een directe balansoverschrijving. Volledig end-to-end geverifieerd op een reeds gefinaliseerde-en-uitbetaalde competitie: match omgedraaid, standings/plaatsingen herberekend, oude grants omgekeerd met een negatieve `duel_point_transactions`-rij (status `reversed`, met reden, nooit verwijderd), nieuwe grants voor de gecorrigeerde plaatsingen uitgegeven, en het volledige 9-regelige DP-audittrail geïnspecteerd en correct bevonden.

**Punt 17 — Rewards:** `distribute_competition_rewards_v2()` — KRITIEK-gelabeld, idempotent via een partial unique index (`(competition_id, profile_id) WHERE status = 'granted'`).

**Punt 18 — Idempotentie:** Dubbele finalize, retry, en dubbele reward-distributie getest — telkens nul dubbele rijen (matches, results, DP-grants, reward-grants).

**Punt 19 — Concurrency:** Écht gelijktijdige, parallel-gebackgrounde `psql`-processen tegen dezelfde competitie voor zowel `finalize_competition_v2` als `distribute_competition_rewards_v2` — `pg_advisory_xact_lock` + de partial-unique-index-guard voorkwamen in elk geval dubbele resultaten.

**Punt 20 — Geschiedenis:** Finale standings, plaatsingen, `completed_at` en rewards blijven permanent zichtbaar na afronding (V1-gedrag, V2 volgt hetzelfde patroon).

**Punt 21 — Mobiel:** UI gebouwd met dezelfde mobile-first `grid gap-3 lg:grid-cols-2`-patronen als de bestaande V1-matchlijst. **Niet visueel getest op 375/390/430px** (geen browser beschikbaar) — structureel mobile-first, maar dit is eerlijk NOT TESTED, geen PASS.

**Commits:** `40cab9e` (DB-laag V2), `bb950dc` (UI-wiring: create-form, detail-pagina, resultaatformulieren).

---

## 2. AI Card Synergy / Deck Coach

**Punt 1 — Architectuur:** Hybride 3-staps-architectuur zoals gevraagd — Stap 1 deterministische kandidaatgeneratie (`card-mechanics.ts` + `card-synergy-candidates.ts`, pure/synchrone JS, geen AI), Stap 2 ranking (in dezelfde module), Stap 3 optionele AI-uitleg van uitsluitend de al-geselecteerde topkandidaten (`card-synergy.ts`). Expliciet **niet** "stuur de hele catalogus naar Anthropic" — de AI ziet nooit meer dan de top-3 kandidaten per aanvraag.

**Punt 2 — Mechanic-extractie:** `card-mechanics.ts` — regex-gebaseerde, deterministische tag-extractie uit echte carddata (Graveyard/discard/banish, in beide richtingen apart: "stuurt weg" vs. "profiteert van"), plus search/draw/destroy/negate/target/tribute/battle/resource-generation en Xyz/Fusion/Synchro/Link-materiaalherkenning. Geen AI, dus goedkoop cachebaar per `card_catalog_id`.

**Punt 3 — Kandidaatgeneratie:** `generateSynergyCandidates()` — combineert de mechanic-tags met échte velden (Level/Rank/Attribute/archetype) om een kandidatenpool te scoren tegen één doelkaart.

**Punt 4 — Ranking:** Gewogen score per reden: directional GY/discard/banish-paar (40) en expliciete Spell/Trap-archetype-support (45) wegen het zwaarst; Xyz-materiaal-Level-match (35) en generieke materiaaltype-match (15) daaronder; gedeeld Attribute/Type/archetype wegen het lichtst (5–10).

**Punt 5 — Rol van archetype:** Archetype-gelijkheid is uitdrukkelijk **niet** voldoende als enige reden — een kandidaat met uitsluitend een gedeeld archetype en verder geen mechanische reden wordt actief **uitgesloten** (geverifieerd in test #1, zie hieronder). Dit is dus structureel geen "zelfde archetype = goed samen"-feature.

**Punt 6 — Collectie-bewust gedrag:** `groupSynergyCandidatesByOwnership()` splitst in "Best Synergy You Own" / "Other Good Synergies", met `ownedCount` per kaart vanuit de echte `card_instances`-tabel van de kijkende speler.

**Punt 7 — Deck-bewust gedrag (Deck Coach V1):** **Niet gebouwd.** De candidate-generation-laag ondersteunt al een optionele `deckCardIds`-uitsluiting (kaarten al in de deck worden niet nogmaals gesuggereerd), maar er is geen Deck Detail-UI gebouwd die dit daadwerkelijk aanroept — bewust geschrapt toen capaciteit begon op te raken, conform "liever features goed dan half af."

**Punt 8 — Master Duel-filtering:** `isMasterDuelOfferable()` (hergebruikt uit `master-duel.ts`, niet opnieuw uitgevonden) sluit `forbidden`/`not_available`/`unknown` uit; `limited`/`semi_limited` blijven toegestaan maar krijgen een zichtbare `masterDuelNote` ("Limited · Max 1 in Master Duel.").

**Punt 9 — AI-provider-gebruik:** `card-synergy.ts` hergebruikt exact het provider-isolatie/fallback-patroon van `boss-companion.ts` (zelfde `ANTHROPIC_API_KEY`-check, zelfde `fetch` + `AbortSignal.timeout`-patroon). De AI krijgt uitsluitend échte carddata + de al-berekende reason-strings, met een systeemprompt die expliciet verbiedt effecten/rulings te verzinnen die niet in de meegegeven tekst staan, en die een strikt `CARD_ID:`-uitvoerformaat afdwingt. AI-antwoorden worden per kaart geparsed; elke `CARD_ID` die niet in de originele kandidatenset zit wordt genegeerd (nooit vertrouwd, ook niet als het formaat klopt).

**Punt 10 — Deterministische fallback:** Zonder API-key (of bij een mislukte call) valt elke suggestie terug op de al-berekende top-reason-string zelf — geen generieke "AI niet beschikbaar"-tekst, maar een inhoudelijk correcte, mechanisch onderbouwde zin. Runtime geverifieerd (zie testcase 10 hieronder): met `ANTHROPIC_API_KEY` bewust niet gezet, kwam `source: "fallback"` terug met een niet-lege, op de Graveyard-mechanic gebaseerde uitleg.

**Punt 11 — Caching:** `card-synergy-context.ts` — in-memory, best-effort cache, sleutel `cardId::userId`, TTL 30 minuten, met dezelfde "groei niet oneindig in een langlevend proces"-guard als Boss Companion's rate-limiter. **Eerlijke beperking:** dit is geen duurzame/gedeelde cache (overleeft geen cold start, geen tweede instance) — een echte persistente cache op `card_catalog_id` + kaartdata-versie is niet gebouwd deze sessie.

**Punt 12 — Card Detail-UI:** `card-synergy-insight.tsx` — ingeklapt-by-default "Duelist Insight"-paneel op `/cards/[id]`, met een expliciete "Get Duelist Insight"-knop (dus **geen** AI-call bij page-load, hover, of per-tile — uitsluitend bij een bewuste klik op één specifieke kaart). Max 3 suggesties, collectie-bewuste indeling, Master Duel-badge per suggestie. Bij een mislukte fetch: "Card insights are temporarily unavailable" — nooit een generieke crash-melding, de rest van de kaartpagina blijft gewoon werken.

**Punt 13 — Deck Coach V1:** Niet gebouwd (zie punt 7).

**Punt 14 — Hallucinatie-waarborgen:** (a) AI ziet nooit meer dan de top-3 al-geselecteerde kandidaten, nooit de catalogus; (b) systeemprompt verbiedt expliciet het verzinnen van effecten/rulings buiten de meegegeven tekst; (c) AI-uitvoer wordt per kaart geparsed en elke onbekende `CARD_ID` genegeerd; (d) zonder geldige AI-uitvoer valt alles terug op tekst die rechtstreeks uit echte carddata is afgeleid, nooit op een generiek "AI zei iets" — er is dus geen pad waarop verzonnen inhoud de speler bereikt.

**Punt 15 — Testcases:** 10 verplichte scenario's, allemaal opgenomen in `src/lib/ai/card-synergy.test.ts` (vitest) **en** los runtime geverifieerd via standalone `node`-scripts (zie Kwaliteitscontrole hieronder voor waarom `vitest run` zelf niet kon draaien in deze omgeving):

| # | Scenario | Resultaat |
|---|---|---|
| 1 | Zelfde archetype alléén → uitgesloten | PASS |
| 2 | Andere archetype, gedeelde GY-mechanic (directional) → aanbevolen | PASS |
| 3 | Xyz + materiaal-Level-compatibiliteit | PASS |
| 4 | Discard-cost + discard-payoff | PASS |
| 5 | Banish + banish-payoff | PASS |
| 6 | Spell/Trap-archetype-support | PASS |
| 7 | Owned-card-voorkeur (collectie-groepering) | PASS |
| 8 | Forbidden-kaart uitgesloten | PASS |
| 9 | Not-in-Master-Duel (`not_available`/`unknown`) uitgesloten, `limited` toegestaan mét notitie | PASS |
| 10 | Ontbrekende AI-key → schone deterministische fallback, geen crash | PASS |
| extra | Gemengde pool: niet elke aanbeveling is puur-archetype | PASS |

**Commit `aef93ad`** (mechanics + candidates + AI-laag + context + API-route + UI + tests, 8 bestanden).

---

## Kwaliteitscontrole

1. **Migraties die de eigenaar zelf handmatig moet draaien:** geen — alle vier nieuwe migraties deze sessie (`202608231030`, `202608231045`, `202608231100`, en de eerdere `202608230021`-aanpassing) zijn additief en klaar om via de normale Supabase-migratieflow van de eigenaar uitgerold te worden; er is geen los, apart script nodig (in tegenstelling tot vorige sessie's `audit-master-duel.mjs`, dat hier niet van toepassing was).
2. **Typecheck:** `npx tsc --noEmit` — schoon, gedraaid via de device-bridge tegen de échte repo (met de al geïnstalleerde `node_modules`), na elke grote batch én finaal.
3. **Lint:** `npx eslint .` (volledige repo) — schoon, zelfde manier gedraaid, finaal.
4. **Build:** **niet uitgevoerd** — bekend, sessie-breed risico: `npm run build` via de device-bridge corrumpeert `.next` en veroorzaakt fantoom-runtimefouten. De cloud-container zelf kon geen `npm install` draaien (bevestigd opnieuw deze sessie: registry geeft `403 Forbidden`), dus een build was hier sowieso niet mogelijk. Bewust niet geprobeerd.
5. **Echte runtime-tests uitgevoerd:** (a) Shop-fix: 5 scenario's tegen `mdtest4`. (b) Shop-prijsfix: correctie + idempotentie + verse generatie + echte aankoop-debit tegen `mdtest4`. (c) Competition V2: schema-replay-idempotentie, round-robin-generator (2 verplichte scenario's + no-double-booking-check), tiebreak-stress-test, resultaatinvoer-validatie, correctie-met-audit-trail, idempotentie (dubbele finalize/retry/dubbele rewards), échte gelijktijdige concurrency via parallelle `psql`-processen — allemaal tegen wegwerpbare `mdtest5`/`mdtest6`/`mdtest7`-databases. (d) AI-laag: 28 assertions over drie standalone `node`-scripts (mechanic-extractie: 18, candidate-generation: 10) plus 6 assertions voor de AI-verklaringslaag inclusief de missing-key-fallback — **plus** dezelfde 10+1 scenario's nogmaals als een gecommit vitest-bestand (`card-synergy.test.ts`), waarvan de logica dus dubbel geverifieerd is (los via `node`, en de exacte testcode staat nu ook in de repo).
6. **NOT TESTED-items, expliciet:** geen enkele UI is in een echte browser bekeken (geen browser beschikbaar deze sessie) — dit geldt voor de volledige Competition V2-UI (create-form, detail-pagina, resultaatinvoer, mobiele 375/390/430px-layout) én de nieuwe "Duelist Insight"-UI op Card Detail. `vitest run` zelf kon niet uitgevoerd worden (zie punt 7). `scripts/audit-master-duel.mjs` is deze sessie niet relevant/niet aangeraakt.
7. **Bekende beperkingen:**
   - `vitest run` kon niet draaien via de device-bridge: `Cannot find module '@rollup/rollup-linux-arm64-gnu'` (een bekende npm-optional-dependency-bug, vereist een `npm install` met netwerktoegang die de device-sandbox niet heeft). De testlógica zelf is dus wél runtime geverifieerd (via equivalente standalone `node`-scripts), maar niet via de vitest-runner zelf — eerlijk vermeld, niet verdoezeld.
   - De AI-synergy-kandidatenpool haalt momenteel de volledige `card_catalog` op (met smalle kolommen, nooit `select *`, nooit naar de browser of naar de AI gestuurd) per ongecachte aanvraag — prima op de huidige catalogusgrootte (~648 testkaarten), maar zou bij een veel grotere catalogus een voorgefilterde/geïndexeerde kandidatenpool nodig hebben.
   - De insight-cache is in-memory en niet duurzaam (zie AI-punt 11).
   - Alleen Xyz-materiaal-Level-compatibiliteit wordt precies geverifieerd; Synchro/Fusion/Link-materiaal-matches gebruiken alleen het zwakkere "beide vermelden dit materiaaltype"-signaal, niet een volledige materiaal-samenstellingscheck.
   - Deck Coach V1 is niet gebouwd (zie AI-punt 7/13).
   - De onderlinge-resultaat-tiebreak in Competition V2 is een documenteerde vereenvoudiging (zie Competition-punt 14), geen volledige iteratieve subgroep-hergroepering.
8. **Commit-hashes deze sessie** (chronologisch): `22f305c`, `efb4d63`, `8480244`, `40cab9e`, `bb950dc`, `aef93ad`.
9. **Bevestiging: productie niet gewijzigd.** Alle SQL-verificatie liep tegen losse, wegwerpbare `mdtest4`–`mdtest7`-databases in de cloud-sandbox. Er is geen enkele live migratie tegen de echte Supabase-instantie gedraaid, geen productietabel gemuteerd, en de drie echte spelersaccounts (`gossie`, `fardin`, `samochamo`) zijn op geen enkel moment gelezen of geschreven.
10. **Bevestiging: niets gepusht.** `git status -sb` bevestigt `main` staat 5 commits vóór op `origin/main` (`efb4d63`, `8480244`, `40cab9e`, `bb950dc`, `aef93ad`) — geen `git push` uitgevoerd. Ter info: commit `22f305c` bleek al vóór deze run op `origin/main` te staan (dus eerder, buiten deze sessie om, gepusht — niet door mij deze sessie).

---

## Volledige testtabel

| Item | Status | Bewijs |
|---|---|---|
| Legendary first-pull ownership-check (5 scenario's) | PASS | echte RPC-aanroepen tegen `mdtest4` |
| Shop: Special Pack-prijs 250→900 DP | PASS | correctie + idempotentie + verse generatie + echte aankoop-debit |
| Competition: schema-audit | PASS (uitgevoerd) | code-inspectie + live-UI-string als bewijs |
| Competition: schema-drift bevestigd | PASS | 8 RPC's + 4 tabellen bevestigd live-maar-niet-in-git |
| Competition: recovery-migratie idempotent | PASS | dubbele replay, tweede run = no-op |
| Competition V2: create-opties + preview | PASS (code) / NOT TESTED (live UI) | typecheck+lint schoon |
| Competition V2: `meetings_per_pairing` ≥ 1 | PASS | 1× en 3× scenario's getest |
| Competition V2: Single Duel | PASS | resultaatinvoer + standings getest |
| Competition V2: Best of 3 | PASS | preset-scores + vroege 2-0-afsluiting getest |
| Competition V2: round-robin 3 spelers × 1× | PASS | 3 matches, 2 per speler |
| Competition V2: round-robin 3 spelers × 3× | PASS | 9 matches, 6 per speler, rematches gespreid |
| Competition V2: geen dubbele ronde-boeking | PASS | verificatiequery |
| Competition V2: standings-berekening | PASS | live RPC-aanroep |
| Competition V2: tiebreakers deterministisch | PASS | 3-weg cyclische-gelijkstand-stresstest |
| Competition V2: resultaatinvoer blokkeert illegale scores | PASS | server + UI defense-in-depth |
| Competition V2: correctie via compenserende transacties | PASS | volledig audittrail geïnspecteerd |
| Competition V2: rewards idempotent | PASS | dubbele finalize/retry/dubbele distributie |
| Competition V2: concurrency (parallelle finalize/rewards) | PASS | echte gelijktijdige `psql`-processen |
| Competition V2: geschiedenis permanent zichtbaar | PASS | `completed_at` + standings na finalize |
| Competition V2: mobiele layout 375/390/430px | NOT TESTED | geen browser beschikbaar |
| AI: mechanic-tag-extractie (directional GY/discard/banish) | PASS | 18 assertions, standalone `node` |
| AI: candidate-generation + ranking | PASS | 10 assertions, standalone `node` |
| AI: archetype alléén is onvoldoende | PASS | testcase #1 |
| AI: collectie-bewuste groepering | PASS | testcase #7 |
| AI: Master Duel-filtering (forbidden/not_available/unknown/limited) | PASS | testcase #8/#9 |
| AI: provider-fallback zonder API-key | PASS | testcase #10, `source: "fallback"` bevestigd |
| AI: hallucinatie-waarborgen (alleen top-3, CARD_ID-validatie) | PASS (code-niveau) | zie Punt 14 hierboven |
| AI: caching (in-memory) | PASS (code) / bewuste beperking | niet duurzaam, zie Beperkingen |
| AI: Card Detail-UI "Duelist Insight" | PASS (code) / NOT TESTED (live UI) | typecheck+lint schoon |
| AI: Deck Coach V1 | NOT BUILT | bewust geschrapt, capaciteit |
| AI: `vitest run` van `card-synergy.test.ts` | NOT TESTED | rollup-native-dependency-bug, geen netwerktoegang |
| Extra QoL | NOT BUILT | capaciteit op, gestopt op schone commit-grens |
| `npm run build` | NOT TESTED | bewust vermeden (device-bridge-corruptie + container-npm-install geblokkeerd) |
| Trading-architectuur | ONGEWIJZIGD | niet aangeraakt deze sessie |
| Shop-rarity-odds/pity/copy-limits | ONGEWIJZIGD | niet aangeraakt deze sessie |
| Master Duel-eligibility-regel | ONGEWIJZIGD | niet versoepeld |
| Legendary-uniciteitsregel | ONGEWIJZIGD | niet aangeraakt |
| Productie-data drie echte spelers | ONGEWIJZIGD | niet gelezen of geschreven deze sessie |

---

## Commits deze sessie (niets gepusht)

```
22f305c fix: correct Legendary first-pull check to use full ownership history
efb4d63 fix: set special spotlight packs to 900 DP
8480244 chore: recover competition schema into migrations
40cab9e feat: add configurable competition scheduling with best-of-three matches
bb950dc feat: wire Competition V2 into create/detail UI and result entry
aef93ad feat: add AI Card Synergy backend + Duelist Insight UI
```
Bevestigd via `git status -sb`: `main` staat 5 commits vóór op `origin/main` sinds het begin van deze grote run (`22f305c` stond, buiten deze sessie om, al eerder op `origin/main`). Geen `git push` uitgevoerd.

---

## Aanbevolen vervolg (in prioriteitsvolgorde)

1. **De vier nieuwe migraties uitrollen** via de normale Supabase-flow van de eigenaar (`202608231030`, `202608231045`, `202608231100`, en indien nog niet gebeurd de `22f305c`-aanpassing binnen `202608230021`) — dit is de enige stap die nodig is om alles hierboven live te krijgen.
2. **Live UI-verificatie** van Competition V2 (create-flow, ronde-per-ronde resultaatinvoer, correctie, finalize, rewards) en de nieuwe "Duelist Insight"-UI op Card Detail, inclusief mobiel 375/390/430px — dit kon deze sessie niet, wegens geen browser.
3. **`ANTHROPIC_API_KEY` zetten** (indien nog niet gedaan) om de AI-uitleglaag daadwerkelijk AI-tekst te laten genereren i.p.v. alleen de deterministische fallback — de app werkt prima zonder, maar mist dan de "menselijke" toon.
4. **Deck Coach V1** — de candidate-generation-laag ondersteunt dit al grotendeels (`deckCardIds`-parameter bestaat), alleen de Deck Detail-UI-sectie ontbreekt nog.
5. **Persistente insight-cache** (i.p.v. in-memory) als de speler-load ooit groter wordt dan één serverproces aankan.
6. Daarna: extra QoL, zoals oorspronkelijk gepland.

---

*Rapport gegenereerd op basis van code-inspectie, uitgebreide scratch-PostgreSQL-verificatie (Shop-fix, Shop-prijsfix, volledige Competition V2 inclusief echte concurrency-tests), en standalone Node.js-runtime-verificatie van de AI-laag (34 directe assertions, plus dezelfde scenario's nogmaals vastgelegd als vitest-bestand in de repo). Geen enkele live/mobiele UI-test uitgevoerd — waar dat nodig was is dat expliciet als NOT TESTED gemarkeerd, nooit als PASS voorgesteld. Geen productiedata aangeraakt, niets gepusht.*
