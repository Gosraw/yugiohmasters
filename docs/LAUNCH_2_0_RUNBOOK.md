# Duelist Circle 2.0: lanceeravond (runbook)

Dit is het stappenplan voor de avond dat 2.0 live gaat.
Doe de stappen **in deze volgorde** en sla er geen over.
Bij elke stap staat een **STOP**. Gebeurt wat daar staat? Ga dan niet verder en vraag om hulp.

Het technische deel (Engels) staat onderaan, in de [Appendix](#technical-appendix-english).

---

## Vooraf (dagen vóór de lanceeravond)

### A. De stemming afronden

De groep stemt in de app over de kaarten (**Profile → Card Vote**).
Daarna moeten de uitslagen in twee bestanden komen:

- `data/banlists/duelist-circle-proposal.json`
- `data/cardpool/ranking-v2.json`

Dat doet de ontwikkelaar (of een AI-hulp) voor je. Daarna maakt die het databestand opnieuw met:

```
node scripts/cardpool/build-pool.mjs
node scripts/cardpool/rank-pool.mjs
node scripts/cardpool/build-v2-format-migration.mjs --out supabase/migrations/<nieuwe-datum>_classic_v2_format_after_vote.sql
```

**STOP als:** het laatste commando een foutmelding geeft.

### B. Jouw beslissing over de Boss Routes

Sommige Boss Routes geven kaarten die eigenlijk niet in de nieuwe pool zitten. Voorbeelden: de hele Cubic-route (van na 2014) en Dark Magician of Chaos (verboden in 2014).

Er staat nu een **schakelaar** klaar. Die staat standaard **AAN**.

- **AAN**: de eigenaar van een route mag zijn eigen Boss-monsters en route-kaarten gewoon in zijn deck doen. Ook als ze buiten de pool vallen of op de banlijst staan. Andere spelers krijgen ze nooit via packs, draft of shop.
- **UIT**: route-kaarten volgen gewoon dezelfde regels als alle andere kaarten.

Zeg tegen de ontwikkelaar welke je wilt. Uit zetten kan op twee manieren: het bestand opnieuw maken met `--no-boss-route-exemption`, of later met één regel SQL (zie de appendix).

### C. Generale repetitie op de testdatabase

Laat de ontwikkelaar de hele avond eerst één keer naspelen op de **lokale testdatabase** (op de Mac, nooit de echte):

1. `node scripts/devstack/db.mjs migrate`
2. Het reset-script met `mode=dry_run`, daarna met `mode=apply` (zie stap 3 en 4 hieronder, maar dan met het lokale adres `postgres://postgres@127.0.0.1:54322/postgres`).
3. De test-bots: `npm run test:e2e:mobile`

**STOP als:** iets hiervan rood wordt.

---

## De lanceeravond

Spreek af dat niemand de app gebruikt tussen stap 1 en stap 6.

### Stap 1: Back-up maken (verplicht)

1. Ga naar het Supabase Dashboard en open het project.
2. Ga naar **Database → Backups** en maak een handmatige back-up.
3. Wacht tot die klaar is. Noteer de tijd.

**STOP als:** je niet zeker weet dat de back-up gelukt is.

### Stap 2: De database bijwerken (migraties)

Je hebt het **adres van de echte database** nodig. Dat vind je in het Supabase Dashboard: **Connect → Connection string (URI)**.
Daarin staat een wachtwoord, dus deel dat adres met niemand en zet het nergens in de code.

Voer in Terminal, in de projectmap, deze regel uit. Zet het adres tussen de aanhalingstekens:

```
DB="postgresql://...het adres uit Supabase..."
```

Daarna voer je de migraties uit, **in deze volgorde**, één voor één:

```
for f in supabase/migrations/20261012*.sql; do echo "== $f"; psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f" || break; done
```

Heb je in stap A een nieuw bestand gemaakt (`..._classic_v2_format_after_vote.sql`)? Voer dat daarna ook uit:

```
psql "$DB" -v ON_ERROR_STOP=1 -q -f supabase/migrations/<nieuwe-datum>_classic_v2_format_after_vote.sql
```

Wat je ziet: per bestand een regel `== supabase/migrations/...`, en geen `ERROR`.

**STOP als:** je ergens `ERROR` ziet. De lus stopt dan vanzelf. Het bestand met de fout is niet half uitgevoerd. Kopieer de foutmelding en vraag om hulp.

### Stap 3: Proefdraaien van de reset (verandert niets)

Kies de **startdatum van Seizoen 2**, bijvoorbeeld maandag `2026-10-19`.

```
psql "$DB" -v ON_ERROR_STOP=1 -v launch_date=2026-10-19 -v mode=dry_run -f scripts/season2/reset-and-activate.sql
```

Wat je moet zien:

- `PRE-FLIGHT OK`
- een lijst `WIPE ...`: wat er gewist gaat worden
- een reeks regels `POST-FLIGHT: ...`, met als laatste `POST-FLIGHT OK`
- als laatste: `DRY RUN finished - ... Nothing changed.`

Controleer in de `POST-FLIGHT`-regels:

- `exactly 6136 eligible cards`. Is de pool na de stemming veranderd? Dan staat hier het nieuwe aantal.
- `rarities live - Legendary 45, ...`
- het juiste aantal spelers bij `league memberships (roles unchanged)`.

**STOP als:** je `ERROR` of `ABORTED` ziet. Er is dan niets veranderd. Kopieer de melding en vraag om hulp.

### Stap 4: De echte reset

Precies hetzelfde commando, maar nu met `mode=apply`:

```
psql "$DB" -v ON_ERROR_STOP=1 -v launch_date=2026-10-19 -v mode=apply -f scripts/season2/reset-and-activate.sql
```

Als laatste regel moet je `SEASON 2 RESET APPLIED (committed).` zien.

**Wat er gebeurt:**

- Gewist: alle kaarten, alle DP, decks, potjes, competities, drafts, Boss-voortgang, luck, vouchers, weekdoelen, Season Path, minigame-scores en ruilen.
- Blijft: alle accounts, wachtwoorden, de league en wie er lid is. Ook blijft wie admin is, dus jij blijft admin. Seizoenstitels blijven ook.
- Daarna: de Classic-pool gaat aan, de nieuwe zeldzaamheden gaan in, en Seizoen 2 begint op de gekozen datum.

**STOP als:** je `ERROR` ziet. Het script is één geheel. Bij een fout wordt **alles** teruggedraaid, en is er dus niets veranderd. Vraag dan om hulp.

### Stap 5: De nieuwe app live zetten

**Vooraf in Vercel:** `SUPABASE_SECRET_KEY` moet gezet zijn (server-only env var, nooit `NEXT_PUBLIC_`); zonder die sleutel worden mini-game-scores (Pyramid Climb / Shadow Arena) niet opgeslagen.

Pas nu wordt de `v2`-branch samengevoegd met `main`. Vercel zet de nieuwe app dan vanzelf live.
Laat dit door de ontwikkelaar doen, of doe het zelf als je weet hoe.
Wacht tot Vercel "Ready" zegt.

### Stap 6: Controle op je telefoon

Log in op `https://yugiohmasters.vercel.app` en loop dit rijtje af:

1. Je komt automatisch bij **Boss Path kiezen**. Kies een route.
2. Daarna start de **Initial Draft**. Kies alle kaarten. Controleer dat je geen Synchro-kaarten ziet en geen kaarten van na 2014, behalve de bekende uitzonderingen zoals Chocolate Magician Girl.
3. Na de draft heb je **3 welkomstpacks**: 1 Normal, 1 Premium en 1 Deluxe. Open ze in de Shop.
4. **Wallet**: je DP begint op 0, plus wat je net verdiend hebt.
5. **Deck builder**: probeer 2× Foolish Burial in één deck te doen. De tweede moet geweigerd worden ("limited to 1 per deck"). Raigeki mag 1×.
6. **Home**: er staat "Season 2 · Week 1".
7. Laat de andere twee spelers hetzelfde doen.

**STOP als:** iets hiervan niet klopt. Maak een schermafbeelding en vraag om hulp.

### Als het echt misgaat (na stap 4)

Zet de back-up van stap 1 terug: **Supabase Dashboard → Database → Backups → Restore**.
Dat zet alles terug naar het moment van de back-up.

---

## Technical appendix (English)

### Every 2026-10-12 migration, in apply order

| File | What it does | Owner |
|---|---|---|
| `202610120100_dp_ledger_descriptions_and_helpers.sql` | `duel_point_transactions.description` (NOT NULL, trigger-filled, backfilled); `_credit_duel_points` takes an optional description; DP helpers. | rewards |
| `202610120110_competition_only_match_dp.sql` | Only competition matches pay match DP; ad-hoc duels pay nothing (wagers unchanged). | rewards |
| `202610120120_round_rewards_resettle_on_correction.sql` | Fixes `settle_round_rewards_v2` crash; an admin correction re-settles the round grants (reversals kept as history). | rewards |
| `202610120130_boss_path_dp_only_config_prices.sql` | Boss evolution = DP only (achievement gates removed); stage / slot prices from config tables. | rewards |
| `202610120140_shop_singles_boss_route_exclusion.sql` | Shop singles never sell stage-4 / route-exclusive cards (`is_boss_route_reserved_card`); shop spending logged in the DP ledger. | rewards |
| `202610120500_card_votes.sql` | Card vote tables, RLS and RPCs (`cast_card_vote`, `set_vote_tiebreak`, `get_vote_results`). | card pool |
| `202610120600_tap_winner_duels.sql` | Record a duel result by tapping the winner (`record_practice_duel`, …). | duels |
| `202610120700_mini_games.sql` | Mini games: `game_runs`, daily seeds, server-validated scores, leaderboard rewards. | mini games |
| `202610120800_season_config_and_weekly_goals.sql` | `seasons` calendar + weekly goals engine (config tables). | engagement |
| `202610120810_season_path.sql` | Season Path tiers / XP / grants, `profile_titles`, overview RPC. | engagement |
| `202610120820_season_bounty_catch_up.sql` | Bounty on #1 and catch-up bonus for last (config in `season_bonus_config`). | engagement |
| `202610120900_shadow_arena.sql` | Auto battler on top of the mini game tables. Check for later `2026101209xx` auto battler files too. | auto battler |
| `202610121000_master_duel_unlimited_rooms.sql` | **Master Duel = Unlimited rooms.** `is_master_duel_offerable()` now blocks only `not_available` (forbidden / limited / semi / unlimited / unknown pass). The format engine blocks `not_available` absolutely, and lets `unknown` through only for curated include overrides. Same signatures, so every caller (draft, shop packs, singles, special packs, format engine) picks it up. | card pool |
| `202610121010_classic_v2_banlist_and_format_schema.sql` | `duelist_circle_card_limits` (our banlist) + `duelist_circle_proposed_rarities`; format flags `curated_pool_only` and `boss_route_exempt`; `is_boss_route_exempt_card()`; final `is_duelist_circle_format_eligible()`; `is_duelist_circle_deck_legal()`; `duelist_circle_deck_copy_limit()`; `validate_deck_card` now uses deck legality; two new triggers enforce copy limits on `deck_cards` insert/update (`add_card_to_deck`) and on `decks.status → ready` (`set_deck_status`). With no active format, nothing changes. | card pool |
| `202610121030_classic_v2_format_seed.sql` | **Generated** (`scripts/cardpool/build-v2-format-migration.mjs`). Adds 151 OCG-only Master Duel cards to `card_catalog` (`format_eligible = false`, MD status `unknown`); the inactive format row `duelist_circle_classic_v2`; 6,136 include overrides; 185 banlist rows (100 forbidden / 70 limited / 15 semi); 6,136 proposed rarities (Legendary 45 / Secret 200 / Ultra 1,145 / Super 1,193 / Rare 1,509 / Normal 2,044). Ends with count assertions. Re-runnable: it replaces this format's rows and never touches `is_active`. | card pool |
| `202610121100_perk_weekly_cap.sql` | Weekly cap on perk (real-life achievement) DP: `perk_config.weekly_dp_cap` (default 600, null = no cap), ISO week in Europe/Amsterdam on approval time; `approve_achievement_claim()` refuses approvals over the cap (claim stays pending); `perk_dp_this_week()` read helper. | rewards |
| `202610121110_shadow_arena_title.sql` | `_mini_game_title()` labels the auto battler "Shadow Arena" in reward descriptions / ledger notes (game key stays `auto_battler`; old ledger rows keep their text). | auto battler |
| `202610121200_security_review_fixes.sql` | Security: RLS + no client rights on `season1_welcome_bonus_claims` (closes repeatable welcome-pack claims); `perk_dp_this_week` no longer callable by anon; drops default write grants on the 2.0 season / weekly-goal / title tables. Additive. | security |
| `202610121210_mini_game_submit_service_only.sql` | Security: `submit_game_run` / `reject_game_run` get an explicit `p_profile_id` and become service-role only (old signatures dropped), so scores only land after the server-side replay. Needs the 2.0 server actions deployed. | mini games |
| `202610121220_competition_submit_guards.sql` | Security: `submit_competition_match_result_v2` refuses non-admin results unless the competition is `active` and the match is not cancelled / declined / completed. Admins unchanged. | competitions |

**Backwards compatibility.** These migrations share the production database with the live `main` app.
`202610121000` takes effect immediately: Master Duel-forbidden cards that are already `format_eligible` become offerable in the live draft and shop.
Everything from `202610121010` onward is dormant until a format is active.
So apply the whole set on launch night only, directly followed by the reset script.

### Launch script: `scripts/season2/reset-and-activate.sql`

- psql-only (it uses `\if` / `\gset`). Variables: `launch_date` (required, a date) and `mode` (`dry_run` | `apply`, required). Use it with `-v ON_ERROR_STOP=1`. It is one transaction: `mode=dry_run` ends in ROLLBACK, `mode=apply` in COMMIT.
- **Pre-flight:**
  - every public table must be in the wipe/keep plan, and an unknown table aborts the run (new auto battler tables must be classified first);
  - no kept table may have a RESTRICT / NO ACTION FK to a wiped table;
  - Classic v2 must have 6,136 includes, 6,136 rarities and at least 1 banlist row (update these numbers on purpose if the vote changes the pool);
  - exactly one current season, which is season 2;
  - `launch_date` must be within −7 to +60 days;
  - every league that has members must have an admin.
- **Wipe (47 tables):**
  - weekly goals (progress, grants, sets), Season Path XP and tier grants, bounty / catch-up grants;
  - mini game runs, settlements and grants;
  - Boss paths, unlocks and events; pack luck; coach insights; welcome claims;
  - drafts, shop history, pity and vouchers;
  - competitions (and everything that hangs off them), matches, wagers and the DP ledger;
  - trades, decks, P2W claims, ownership history and card instances (`prevent_card_instance_delete_trigger` is disabled and re-enabled around that one delete, inside the transaction);
  - `profiles.duel_points` and `wallets` are set to 0.
- **Kept:**
  - profiles, wallets rows, leagues, `league_members` **with roles** (the admin stays admin, so no `claim_league_admin_if_none` is needed), `profile_titles`;
  - catalog, all config, card votes, audit log, wishlists.
- **Then:**
  - sets `seasons.starts_on`;
  - activates `duelist_circle_classic_v2` and deactivates any other format;
  - recomputes `format_eligible` with the engine (inline, because `recompute_format_eligibility()` needs a signed-in admin);
  - copies the proposed rarities into `game_rarity` (`rarity_reason = 'Season 2 Classic ranking (ranking-v2, rank N)'`);
  - retires the active shop singles rotation and calls `ensure_shop_rotations_current()`. Special pack rotations keep running, because they only hold a theme.
- **Post-flight:**
  - every wiped table is empty, all DP is 0, no shop slot is sold, and the delete guard is enabled again;
  - memberships and roles are identical to the snapshot;
  - profiles, leagues, catalog, titles and votes have the same counts;
  - the season starts on `launch_date`;
  - v2 is the only active format, and exactly the 6,136 pool cards are eligible;
  - every pool card has its proposed rarity;
  - the active singles rotation only holds pool cards;
  - as information only, it prints special packs that have fewer than 40 cards left in the new pool.

**Local dry run (2026-10-12, devstack DB, `launch_date=2026-10-19`):**

- Every assertion passed.
- It would wipe 1,704 rows and reset 4,850 DP across 3 profiles.
- Result: 6,136 eligible cards. Rarities: Legendary 45, Secret 200, Ultra 1,145, Super 1,193, Rare 1,509, Normal 2,044.
- The singles rotation was regenerated.
- Everything was rolled back.

A follow-up smoke test, done in the same rolled-back transaction, also passed:

- `claim_welcome_packs()` granted Normal + Premium + Deluxe again;
- `choose_boss_path` worked;
- `start_personal_initial_draft` worked;
- the first draft offer held only pool cards.

### Banlist / rarity regeneration

```
node scripts/cardpool/build-v2-format-migration.mjs \
  [--out supabase/migrations/<ts>_classic_v2_format_after_vote.sql] \
  [--no-boss-route-exemption] [--skip-catalog-additions]
```

- **Inputs:**
  - `data/cardpool/classic-v2-pool.json`
  - `data/cardpool/ranking-v2.json`
  - `data/banlists/tcg-2014-10.json`
  - `data/banlists/duelist-circle-proposal.json`
  - the git-ignored YGOPRODeck snapshot, for the catalog additions only
- **Precedence:**
  - a proposal verdict overrides the 2014 status;
  - `legendary_unique` gives **no** deck limit, because it is rarity Legendary, which means 1 per league through `card_copy_limit`;
  - only cards in the pool get a row. The 8 listed Synchro / Ice Barrier cards are outside the pool.
- **Self-checks:**
  - every limit is cross-checked against `classic-v2-pool.json`'s `max_copies_per_deck`;
  - the forbidden count must equal the number of non-playable pool cards;
  - the ranking must cover exactly the playable cards;
  - the output must pass the quote-safety scanner (`findUnsafeSqlLiteral`).
- **Once a seed has been applied anywhere,** emit a **new** file name. The SQL replaces the format's rows, so a later file supersedes the earlier one.

### Boss-route exemption (owner decision pending)

`duelist_circle_formats.boss_route_exempt` (default **true** in the generated seed).

- **Exempt cards.** `is_boss_route_exempt_card()` covers every `boss_route_stages.evolution_card_catalog_id` (all stages) plus every `boss_route_stage_grants` row with `is_route_exclusive`.
- **When true:**
  - exempt cards are **deck-legal** (`is_duelist_circle_deck_legal`) and have no copy limit;
  - they are still never `format_eligible`, so draft, shop packs and singles never offer one that is outside the pool. Example: Souleating Oviraptor, a post-2014 stage-2 evolution, stays out of packs.
- **Always blocks, even when true:** `not_available` in Master Duel and an explicit `exclude` override.
- **Live data: 47 route cards are affected.**
  - 43 are outside the pool. Examples: the whole Cubic route, Blue-Eyes Jet Dragon, Cyber Dragon Infinity, The Dark Magicians, Dark Magician of Chaos, Dimension Fusion and Return from the Different Dimension (2014-forbidden exclusive grants).
  - 4 are in the pool but on the banlist: BLS - Envoy of the Beginning (limited), Chaos Sorcerer (semi), Ojama Trio (semi) and Toon Cannon Soldier (limited).
- **Turn it off without regenerating:**
  ```sql
  update public.duelist_circle_formats set boss_route_exempt = false where code = 'duelist_circle_classic_v2';
  ```
- **Note on the clash list.** The clash list in `docs/cardpool-v2-foundation.md` came from `data/boss-route-registry.mjs`. The live DB route data differs after the Season 1 fix migrations. For example, the Chaos stage-4 boss is BLS - Envoy of the Beginning, not Chaos Emperor Dragon, and the DM stage-4 boss is The Dark Magicians. Chaos Emperor Dragon is therefore simply forbidden, with no route conflict.

### Tests

`node scripts/sql-tests/run.mjs 3` runs against the local DB only and always rolls back.

- `30_master_duel_unlimited_rooms.sql`:
  - the helper per status;
  - the engine for unknown / not_available / forbidden, with and without a curated include;
  - `pick_shop_pack_card` offers an MD-forbidden card and never a not_available one.
- `31_deck_card_limits.sql`:
  - the banlist data;
  - no limits without an active format;
  - limits 0 / 1 / 2;
  - legendary_unique gets no limit;
  - the Boss exemption on and off;
  - `add_card_to_deck` refuses the 2nd Foolish Burial, the 3rd Reasoning and any Yata-Garasu;
  - `set_deck_status('ready')` refuses a deck after a limit is tightened.
- `32_classic_v2_format.sql`:
  - the format row is inactive, curated, Fusion + Xyz only, cutoff 2014;
  - 6,136 includes, 151 catalog additions and 6,136 rarities, with live `game_rarity` untouched;
  - eligibility is exactly 6,136;
  - deck legality with the exemption on and off;
  - Junk Synchron and Synchro Barrier are out;
  - the unknown-status OCG card is in.

The full suite (`node scripts/sql-tests/run.mjs`) passes: 12 files.

### Known follow-ups (not done here)

- **`src/lib/master-duel.ts`** still mirrors the old conservative rule. `isMasterDuelOfferable` uses `copyLimit > 0`, and `evaluateMasterDuelDeckLegality` flags MD-forbidden / limited / unknown cards. The deck builder's "Master Duel check" will therefore warn about cards that are fine in Unlimited rooms. Change it to block only `not_available`, and show our own `duelist_circle_card_limits` instead.
- **Deck builder UI** (`src/components/deck-builder/deck-store.ts`) blocks `!format_eligible` client-side. If the Boss exemption stays on, it must also allow route-exempt cards, for example via an RPC or column based on `is_duelist_circle_deck_legal`. It should also show our banlist limits, which can be read from `duelist_circle_card_limits` via RLS.
- **No general "max 3 copies per deck" rule** exists server-side, and it never has. Only the banlist limits are enforced. Adding a default of 3 is a new deck rule and needs the owner's OK.
- **Welcome voucher labels** still say "Season 1 welcome bonus" (`claim_welcome_packs`). This is cosmetic.
- **Test bots:** `npm run test:e2e` resets the local DB in its global setup, so it was not run here. Run it during the rehearsal (step C).
