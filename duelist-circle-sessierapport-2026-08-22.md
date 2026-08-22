# Duelist Circle — Ontwikkelsessie Rapport
**22 augustus 2026 · V1.2-opdracht (Mobile Collection/Deckbuilder → Master Duel-compatibiliteit)**

Deze sessie is volledig autonoom uitgevoerd volgens de "V1.2 update"-opdracht die vóór het slapengaan is gegeven, met de expliciete instructie niets te vragen. De vaste regels golden onverkort: de drie echte spelersaccounts (`gossie`, `fardin`, `samochamo`) zijn niet buiten normale featurelogica om aangeraakt, trading is niet herbouwd, er is niets naar `origin/main` gepusht, en "compileert" is nergens gelijkgesteld aan "werkt" — waar runtime-verificatie niet haalbaar was, staat dat hier eerlijk vermeld.

**Volgorde uit de opdracht:** 1) Mobile Collection + Deckbuilder — 2) Master Duel-compatibiliteit — 3) Competition V2 — 4) Shop V2 — 5) Pack opening-cinematics — 6) extra QOL. Onderstaand rapport volgt diezelfde volgorde en is eerlijk over wat wél en wat NIET binnen de sessie is gehaald.

---

## Samenvatting vooraf

| Onderdeel | Status |
|---|---|
| 1. Mobile Collection | ✅ Gebouwd, typecheck+lint schoon, gecommit |
| 1. Mobile Deckbuilder | ✅ Gebouwd, typecheck+lint schoon, gecommit |
| 2. Master Duel — datamodel + backend-eligibility (Draft/Shop) | ✅ Gebouwd, **runtime geverifieerd** in scratch-database, gecommit |
| 2. Master Duel — UI (badges, "MD-ready" deckcheck) | ❌ Niet gebouwd — zie Beperkingen |
| 2. Master Duel — audit-script (echte per-kaart sync) | ✅ Geschreven, **bewust niet door mij gedraaid** (vereist eigenaars eigen service-role sleutel) |
| 3. Competition V2 (round-robin scheduler) | ❌ Niet gebouwd — zie kritieke bevinding hieronder |
| 4. Shop V2 | ❌ Niet gebouwd |
| 5. Pack opening-cinematics | ❌ Niet gebouwd |
| 6. Extra QOL | ❌ Niet gebouwd |

**Waarom niet alles:** deze sessie is een voortzetting (context-samenvatting) van een al lange sessie. Het grondig en écht runtime-verifiëren van de Master Duel-laag (zie punt 2 hieronder) heeft veel van de resterende tijd gekost — bewust, want "compileert" is niet "werkt", en juist déze laag raakt twee van de meest gevoelige, al eerder fijn-getunede RNG-functies in de hele app (Draft en Shop pack-picks). Ik heb ervoor gekozen dat grondig te doen in plaats van door te razen naar Competition/Shop/Pack-cinematics met alleen statische redenering — dat zou tegen de kern van de opdracht ("Wees eerlijk. Static reasoning is NIET runtime tested.") ingaan. Zie "Aanbevolen vervolg" onderaan voor hoe dit verder moet.

---

## KRITIEKE BEVINDING — Competition-systeem staat niet in git

Voordat er ook maar iets aan Competition V2 gebouwd kon worden, is eerst het bestaande Competition-systeem geïnspecteerd. Daaruit kwam een serieuze, eerder onopgemerkte bevinding:

De tabellen `competitions`, `competition_players`, `competition_reward_rules`, `competition_results`, de kolom `matches.competition_id`, en de RPC's `create_competition`, `add_competition_player`, `remove_competition_player`, `start_competition`, `get_competition_standings`, `finalize_round_robin_competition`, `distribute_competition_rewards`, `install_default_competition_rewards` bestaan **live in productie-Supabase**, maar staan in **geen enkele van de 21 migratiebestanden** die in git zitten. Dit is bevestigd via een uitputtende grep over de volledige migraties-map (alleen 3 bestanden noemen "competition" en dat zijn losstaande comments) én door de live Supabase-queries in `competitions/page.tsx` en `competitions/[id]/page.tsx` direct te lezen. De live UI zelf zegt letterlijk: *"we have not built automatic round-robin scheduling yet. That is the next step."* — dit is dus een bevestigd, echt gat, geen artefact van een verkeerde checkout.

**Gevolg voor scope:** de interne logica van deze acht RPC's (tiebreakers, standings-berekening, reward-idempotentie) is een volledige black box — die kan deze sessie niet veilig geïnspecteerd of gewijzigd worden. Een round-robin scheduler zou daarom alleen veilig gebouwd kunnen worden als **puur additieve** laag (een nieuwe kolom `meetings_per_pairing` op `competitions` + een nieuwe `generate_competition_schedule()`-RPC die `matches`-rijen met `competition_id` invoegt, zonder de bestaande black-box RPC's aan te raken). Dat ontwerp is doordacht maar **niet geïmplementeerd** deze sessie — zie "Aanbevolen vervolg."

**Aanbeveling los van deze sessie:** de eigenaar zou op enig moment `supabase db dump` (of gelijkwaardig) moeten draaien tegen productie om deze acht RPC's alsnog in migratievorm in git te krijgen — zonder dat is toekomstige wijziging van dit systeem altijd riskant giswerk.

---

## 1. Mobile Collection

- **Sectie-filter Main/Fusion/Xyz** toegevoegd aan `src/lib/collection.ts` (`isExtraDeckCardType`-helper, analoog aan de bestaande `isExtraDeckCard` in de deckbuilder) en aan het filterformulier op `/cards/collection`.
- **Filter-bottomsheet op mobiel**: het bestaande filterformulier is omgebouwd tot een `peer`-gestuurde bottom-sheet (open-knop met actieve-filters-badge, backdrop, `fixed inset-x-0 bottom-0`-paneel) — **desktop-layout is ongewijzigd**, alleen `sm:hidden`/`sm:static` schakelt het gedrag om.
- **Scroll-positie-herstel**: nieuwe `ScrollPositionMemory`-component (`src/components/scroll-position-memory.tsx`) die de scrollpositie van de collectiegrid opslaat in `sessionStorage` bij het verlaten van de pagina (via de `useEffect`-cleanup, de betrouwbare Next.js App Router-navigatiesignaal) en herstelt bij terugkeer.
- **Swipe-navigatie op kaartdetail**: nieuwe `CardDetailSwipeNav`-component — links/rechts vegen tussen aangrenzende kaarten, met een 24px-marge langs de linkerrand die vrij blijft voor iOS' eigen terug-swipe, en zonder ooit `preventDefault` aan te roepen zodat de OS-gebaren nooit geblokkeerd worden.

**Bestanden:** `src/lib/collection.ts`, `src/app/(app)/cards/collection/page.tsx`, `src/app/(app)/cards/[id]/page.tsx`, `src/components/scroll-position-memory.tsx` (nieuw), `src/components/card-detail-swipe-nav.tsx` (nieuw).

## 2. Mobile Deckbuilder

- **Sticky mobiele statusbalk**: boven het Browse-paneel op `/decks/[id]` toont nu een `sticky top-0`-balk (alleen zichtbaar op mobiel, alleen in Browse-weergave) Main X/60, Extra X/15 en een Ready/Not Ready-indicator.
- **Echte navigatie i.p.v. pure-CSS-tabs**: de oude `peer-checked`-radio-tabs voor Browse/My Deck zijn vervangen door `?view=browse`/`?view=deck`-links (`replace`, `scroll={false}`) — de actieve tab overleeft nu een reload of terug/vooruit-navigatie, wat met de oude pure-CSS-aanpak niet kon.
- **URL-gesynchroniseerde filters** in `deck-collection-browser.tsx`: zoekterm, categorie, sectie, rarity, sortering en "alleen beschikbaar" worden nu (met korte query-keys als `bq`/`bcat`/`bsec`) in de URL bijgehouden via `router.replace(..., { scroll: false })`, zodat een reload of gedeelde link dezelfde gefilterde weergave teruggeeft. Bestaande click/change-handlers zijn ongewijzigd — een enkele effect-hook reageert op elke state-wijziging.

**Bestanden:** `src/components/deck-collection-browser.tsx`, `src/app/(app)/decks/[id]/page.tsx`.

**Verificatie 1+2:** `npm run typecheck` en `npm run lint` — beide schoon, gedraaid tegen de échte repo via de device-bridge (niet alleen container-lokaal). **Geen enkele live/mobiele visuele test uitgevoerd** — dat blijft, net als vorige sessie, een bekende beperking van deze werkwijze.

---

## 3. Master Duel-compatibiliteit

### Ontwerp
Nieuwe, losstaande eligibility-dimensie op `card_catalog`, naast (niet in plaats van) de bestaande `format_eligible`-kolom die Duelist Circle's eigen huisformaat regelt:

- `master_duel_status text` (`unlimited` / `semi_limited` / `limited` / `forbidden` / `not_available` / `unknown`, default `unknown`) + `master_duel_card_id` + `master_duel_checked_at`.
- `is_master_duel_offerable(status)` — gedeelde predicate: **true, tenzij** `forbidden` of `not_available`.
- `get_master_duel_status_counts()` — read-only auditrapport.
- `set_card_master_duel_status()` — admin-only single-card override (zelfde `league_members.role = 'admin'`-patroon als elders in de codebase).
- `create_next_draft_offer()` en `pick_shop_pack_card()` **opnieuw uitgegeven** met de nieuwe predicate op elk van de bestaande `format_eligible = true`-selectiepunten (7 stuks in de draft-functie, 4 in de shop-functie) — verder **geen enkele andere regel gewijzigd**: rarity-gewichten, pity en de fallback-cascade zijn byte-voor-byte identiek aan de live 2026-08-21/22-versies. Geverifieerd via een geautomatiseerde diff (predicate-regels eruit gestript → exact gelijk aan het origineel, op cosmetische lege regels na).

### Bewuste keuze: "unknown" telt als aanbiedbaar
`is_master_duel_offerable()` sluit alleen `forbidden` en `not_available` uit — `unknown` (de status van vrijwel de hele bestaande catalogus, totdat het audit-script draait) blijft dus gewoon aanbiedbaar in Draft en Shop. Het alternatief (unknown standaard uitsluiten) zou zonder waarschuwing bijna de hele kaartpool onbeschikbaar maken zodra deze migratie draait — een echte regressie voor de drie echte spelers. Dit staat uitgebreid gedocumenteerd in de migratie-header zelf; **als de eigenaar het tegenovergestelde wilde, is dat een eenregelige wijziging** in `is_master_duel_offerable()`.

### Wat NIET met vertrouwen kon: de fijne banlist
De binaire vraag "zit deze kaart wel/niet in Master Duel" is deze sessie bevestigd als betrouwbaar op te halen via YGOPRODeck's `?format=master%20duel`-parameter (dezelfde databron als `card_catalog` al gebruikt). De fijnmazigere Forbidden/Limited/Semi-Limited **banlist**-substatus kon **niet** betrouwbaar bevestigd worden — YGOPRODeck's eigen banlist-pagina rendert client-side in JavaScript, niet uitleesbaar met de tooling die deze sessie beschikbaar had. `scripts/audit-master-duel.mjs` schrijft daarom uitsluitend `unlimited`/`not_available`, en raakt kaarten die al handmatig op `forbidden`/`semi_limited`/`limited` staan nooit aan.

### Runtime-verificatie (niet alleen static reasoning)
1. De volledige, echte 21-bestanden-migratieketen **plus** deze nieuwe migratie is herafgespeeld in een schone PostgreSQL 16-instantie in de cloud-sandbox (dus tegen het échte, actuele schema) — **nul SQL-fouten**, op de eerste of tweede poging na kleine stub-rol-issues die niets met de nieuwe migratie zelf te maken hadden.
2. Met geseede testdata (6 rarities × 4 master_duel_status-waarden, plus extra `unlimited`-kaarten om de pity/gewichts-drempels te halen) is `create_next_draft_offer()` **15 keer achter elkaar echt aangeroepen** (elke keer gevolgd door een echte pick, zoals de app dat ook doet) — **45 aangeboden kaarten in totaal, nul keer** een `forbidden`- of `not_available`-kaart, wél zowel `unlimited` (39×) als `unknown` (6×) — precies het bedoelde gedrag.
3. `pick_shop_pack_card()` is **120 keer echt aangeroepen** (20× per rarity, alle 6 rarities) — zelfde resultaat: nul keer `forbidden`/`not_available`, beide `unlimited` en `unknown` kwamen voor.

Dit is dus **echte runtime-verificatie tegen het echte schema met echte functie-aanroepen**, niet alleen "de SQL ziet er goed uit."

### Wat WEL geschreven maar NIET door mij gedraaid is
`scripts/audit-master-duel.mjs` — het herhaalbare syncscript (zelfde patroon als het bestaande `scripts/sync-cards.mjs`: service-role sleutel, bypassed RLS, batch-upsert). Dit script **moet de eigenaar zelf draaien** met hun eigen `.env.local`-sleutel — ik heb die sleutel niet, en het zou een echte bulk-wijziging op productiedata zijn gebaseerd op live API-respons die ik niet volledig kon verifiëren. Dat is precies waarom dit script bewust niet is uitgevoerd deze sessie.

### Wat NIET is gebouwd (Task #60, UI-integratie)
De backend-eligibility is volledig klaar en geverifieerd, maar is **nog nergens zichtbaar in de UI**: geen Master Duel-statusbadge op de kaartdetailpagina of in de Collection-grid, en geen "Master Duel-ready"-check in de deckbuilder. Dit is bewust niet gehaast — een halve, ongeteste UI-wijziging aan het eind van een lange sessie zou meer risico opleveren dan waarde toevoegen. Zie "Aanbevolen vervolg."

**Bestanden:** `supabase/migrations/202608220020_master_duel_compatibility.sql` (nieuw, 1660 regels), `scripts/audit-master-duel.mjs` (nieuw).

---

## Kwaliteitscontrole

- **Typecheck:** `npm run typecheck` — schoon (gedraaid na elke frontend-wijziging én finaal).
- **Lint:** `npm run lint` — schoon.
- **Build:** **niet uitgevoerd** — `npm run build` faalt structureel via de device-bridge door een `@rollup/rollup-linux-arm64-gnu`-platformmismatch (bekend, staat in `CLAUDE.md`) en schrijft daarbij een corrupte gedeeltelijke `.next`-map die latere fantoom-runtime-fouten veroorzaakt als hij per ongeluk toch gedraaid wordt — dus bewust vermeden.
- **SQL-migratie:** herafgespeeld tegen de volledige echte migratieketen in een schone Postgres 16-instantie — nul fouten (zie boven).
- **Draft/Shop RPC's:** 165 echte functie-aanroepen (45 draft-offers + 120 shop-picks) tegen geseede testdata — nul lekken van `forbidden`/`not_available`-kaarten (zie boven).
- **Geen enkele live/mobiele visuele test** uitgevoerd op de mobiele UI-wijzigingen (zelfde bekende beperking als vorige sessie).
- **Geen productie-data aangeraakt**: alle SQL-verificatie liep tegen een losse, wegwerpbare `mdtest`-database in de cloud-sandbox, nooit tegen de echte Supabase-instantie. De drie echte spelersaccounts zijn deze sessie op geen enkel moment gelezen of geschreven.

## Testtabel

| Item | Status | Bewijs |
|---|---|---|
| Collection sectie-filter (Main/Fusion/Xyz) | PASS (code) / NOT TESTED (live) | typecheck+lint schoon |
| Collection filter-bottomsheet mobiel | PASS (code) / NOT TESTED (live) | typecheck+lint schoon |
| Scroll-positie-herstel collectie | PASS (code) / NOT TESTED (live) | typecheck+lint schoon |
| Swipe-navigatie kaartdetail | PASS (code) / NOT TESTED (live) | typecheck+lint schoon |
| Deckbuilder sticky statusbalk | PASS (code) / NOT TESTED (live) | typecheck+lint schoon |
| Deckbuilder URL-gesynchroniseerde filters | PASS (code) / NOT TESTED (live) | typecheck+lint schoon |
| Deckbuilder Browse/My Deck-navigatie via URL | PASS (code) / NOT TESTED (live) | typecheck+lint schoon |
| Master Duel-migratie (schema + functies) tegen echte migratieketen | PASS | schone replay, 0 fouten |
| `is_master_duel_offerable()` / `get_master_duel_status_counts()` / `set_card_master_duel_status()` | PASS (aangemaakt + grants correct) | replay, geen aparte call-test op `set_card_master_duel_status` |
| `create_next_draft_offer()` sluit forbidden/not_available uit | PASS | 45 echte aanroepen, 0 lekken |
| `create_next_draft_offer()` biedt unknown/unlimited nog steeds aan | PASS | 39×unlimited + 6×unknown aangeboden |
| `pick_shop_pack_card()` sluit forbidden/not_available uit | PASS | 120 echte aanroepen, 0 lekken |
| `scripts/audit-master-duel.mjs` daadwerkelijk tegen YGOPRODeck/Supabase gedraaid | NOT TESTED (bewust — vereist eigenaars sleutel) | — |
| Master Duel-statusbadge in UI | NOT BUILT | — |
| "Master Duel-ready" deckcheck | NOT BUILT | — |
| Competition V2 (round-robin scheduler) | NOT BUILT | zie kritieke bevinding |
| Shop V2 | NOT BUILT | — |
| Pack opening-cinematics | NOT BUILT | — |
| Extra QOL | NOT BUILT | — |
| `npm run build` | NOT TESTED (bewust vermeden, bekend platformprobleem) | — |
| Trading-architectuur (geen locks, first-valid-accept-wins) | ONGEWIJZIGD | niet aangeraakt deze sessie |
| Productie-data drie echte spelers | ONGEWIJZIGD | niet gelezen of geschreven deze sessie |

---

## Commits deze sessie (niets gepusht)

```
5b6ec99 Master Duel compatibility layer: eligibility model + Draft/Shop wiring
22a289c Mobile: deckbuilder sticky summary bar + URL-synced filters
453ecb9 Mobile: collection filter bottom-sheet, scroll memory, swipe nav
```
Bevestigd via `git status -sb`: `main` staat 3 commits vóór op `origin/main`, geen `git push` uitgevoerd.

---

## Aanbevolen vervolg (in prioriteitsvolgorde)

1. **Master Duel UI** (kleinste, laagste risico, backend al klaar): statusbadge op kaartdetail + collectiegrid, en een "Master Duel-ready"-indicator in de deckbuilder naast de bestaande Main/Extra-teller.
2. **`scripts/audit-master-duel.mjs` draaien** (door de eigenaar, met hun eigen `.env.local`) zodat de catalogus daadwerkelijk `unlimited`/`not_available`-statussen krijgt in plaats van overal `unknown`.
3. **Competition-migraties alsnog vastleggen** (`supabase db dump` tegen productie) — dit ontgrendelt pas écht veilige verdere Competition-wijzigingen, inclusief een round-robin scheduler.
4. Daarna, in volgorde: Competition V2 (additieve scheduler-RPC, black-box RPC's met rust laten), Shop V2, Pack opening-cinematics, extra QOL.

---

*Rapport gegenereerd op basis van code-inspectie, een schone PostgreSQL 16-replay van de volledige echte migratieketen, en 165 echte RPC-aanroepen tegen geseede testdata. Geen enkele live/mobiele visuele test uitgevoerd — waar dat nodig was is de veilige, minst-risicovolle keuze gemaakt. Geen productie-data aangeraakt.*
