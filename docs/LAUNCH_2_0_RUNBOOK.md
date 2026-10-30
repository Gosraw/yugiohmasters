# Duelist Circle 2.0: lanceeravond (runbook)

Dit is het stappenplan voor de avond dat 2.0 live gaat.
Doe de stappen **in deze volgorde** en sla er geen over.
Bij elke stap staat een **STOP**. Gebeurt wat daar staat? Ga dan niet verder en vraag om hulp.

Het technische deel (Engels) staat onderaan, in de [Appendix](#technical-appendix-english).

---

## Vooraf (dagen vóór de lanceeravond)

### A. De stemming afronden

**Klaar (30 oktober 2026).** De stemming is gesloten en de uitslag is verwerkt, met jouw besluiten. Zie `docs/CARD_VOTE_RESULT_2026-10-30.md`.

- `data/cardpool/vote-results-2026-10-30.json`: de uitslag per kaart.
- `data/banlists/duelist-circle-proposal.json` en `data/cardpool/ranking-v2.json`: bijgewerkt.
- `supabase/migrations/202610301200_classic_v2_format_after_vote.sql`: het nieuwe databestand. Er zijn nu 6.167 speelbare kaarten, waarvan 21 Legendary.

Je hoeft hier niets meer te doen. Moet de uitslag ooit opnieuw, dan draait de ontwikkelaar dit (met een **nieuwe** bestandsnaam, want het bestand van 30 oktober is dan misschien al gebruikt):

```
node scripts/cardpool/build-pool.mjs
node scripts/cardpool/rank-pool.mjs
node scripts/cardpool/build-v2-format-migration.mjs --out supabase/migrations/<nieuwe-datum>_classic_v2_format_after_vote.sql
```

**STOP als:** het laatste commando een foutmelding geeft.

### B. Jouw beslissing over de Boss Routes

Seizoen 2 heeft **14 nieuwe Boss Paths** (zie `docs/BOSS_PATHS_V3.md`). Sommige daarvan geven kaarten die eigenlijk niet in de nieuwe pool zitten. Voorbeelden: Secret Six Samurai - Rihan en Neo Blue-Eyes Ultimate Dragon (allebei van na 2014).

Er staat nu een **schakelaar** klaar. Die staat standaard **AAN**.

- **AAN**: de eigenaar van een route mag zijn eigen Boss-monsters en route-kaarten gewoon in zijn deck doen, ook als ze buiten de pool vallen. Alleen wie die route heeft, mag ze gebruiken. Andere spelers krijgen ze nooit via packs, draft of shop, en ook niet via een ruil (dan weigert de deckbouwer de kaart). Route-kaarten die wél in de pool zitten, houden gewoon hun banlijst-limiet.
- **UIT**: route-kaarten volgen gewoon dezelfde regels als alle andere kaarten.

Zeg tegen de ontwikkelaar welke je wilt. Uit zetten kan op twee manieren: het bestand opnieuw maken met `--no-boss-route-exemption`, of later met één regel SQL (zie de appendix).

### C. Generale repetitie op de testdatabase

Laat de ontwikkelaar de hele avond eerst één keer naspelen op de **lokale testdatabase** (op de Mac, nooit de echte):

1. `node scripts/devstack/db.mjs migrate`
2. Stap 2b (de seizoenscijfers), met het lokale adres `postgres://postgres@127.0.0.1:54322/postgres`. Sla deze niet over: anders kloppen de Boss-prijzen niet.
3. Het reset-script met `mode=dry_run`, daarna met `mode=apply` (zie stap 3 en 4 hieronder, met hetzelfde lokale adres).
4. De test-bots: `npm run test:e2e:mobile`. Let op: de bots **wissen eerst de lokale testdatabase** en bouwen hem opnieuw op. Doe ze dus als laatste.

**STOP als:** iets hiervan rood wordt.

*Generale repetitie gedaan op 30 oktober 2026 (lokaal, `launch_date=2026-10-30`): alles groen, zie het verslag van die avond.*

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
for f in supabase/migrations/2026101[245]*.sql supabase/migrations/20261030*.sql; do case "$f" in *202610120500_card_votes.sql) echo "-- skip $f"; continue;; esac; echo "== $f"; psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f" || break; done
```

Deze regel doet alle bestanden van 12, 14, 15 en 30 oktober, in de goede volgorde. De bestanden van 30 oktober zijn: de 14 nieuwe Boss Paths (`202610301000`), het verbergen van de minigames (`202610301100`), de uitslag van de kaartstemming (`202610301200`), een kleine reparatie voor kaart-inzetten (`202610301300`) en het Boss Path-rad (`202610301400`). Je hoeft die dus **niet** nog eens los uit te voeren. Eén bestand wordt bewust **overgeslagen** (`202610120500_card_votes.sql`): de echte database heeft de stemming al sinds 12 oktober, en dat oude testbestand zou daar een fout geven. Je ziet dan `-- skip ...`; dat is goed.

Bij het bestand `202610301200_classic_v2_format_after_vote.sql` zie je `Classic v2 seed OK: 6167 includes, 191 banlist rows, 6167 proposed rarities` (en nog iets erachter). Het laatste bestand in de lijst is `202610301400_boss_route_wheel.sql`; daar zie je `BOSS ROUTE WHEEL: spin_boss_path_wheel, ... are in place.`

Wat je ziet: per bestand een regel `== supabase/migrations/...`, en geen `ERROR`.

**STOP als:** je ergens `ERROR` ziet. De lus stopt dan vanzelf. Het bestand met de fout is niet half uitgevoerd. Kopieer de foutmelding en vraag om hulp.

### Stap 2b: De goedgekeurde seizoenscijfers zetten

Je hebt de cijfers uit de simulator op 12 oktober goedgekeurd (Boss
1.800 / 3.200 / 5.500, routes 3.000 / 5.500, rondeplaatsen 350/200/100).
Deze stap zet ze in de database:

```
psql "$DB" -v ON_ERROR_STOP=1 -c "set duelist.approve_season2_numbers = 'yes'" -f supabase/proposals/season2_numbers.sql
```

Wat je ziet: `SET`, `BEGIN`, `DO`, `UPDATE 42` (14 routes × 3 stages; meer als er nog oude routes met spelers zijn, dat is goed), `UPDATE 1`, `UPDATE 0`, `COMMIT`.

**STOP als:** je `ERROR` ziet.

(De testbots in `tests/e2e/economy-rules.ts` hoef je **niet** aan te passen. Dat is werk voor de ontwikkelaar, zie de appendix.)

### Stap 3: Proefdraaien van de reset (verandert niets)

Kies de **startdatum van Seizoen 2**. Voor vanavond is dat `2026-10-30`.
(Goed om te weten: "Week 1" is de week van maandag tot en met zondag waarin die datum valt. Bij 30 oktober (een vrijdag) loopt Week 1 dus tot en met zondag 1 november, en gaan de weekdoelen maandag 2 november opnieuw in.)

```
psql "$DB" -v ON_ERROR_STOP=1 -v launch_date=2026-10-30 -v mode=dry_run -f scripts/season2/reset-and-activate.sql
```

Wat je moet zien:

- `PRE-FLIGHT OK`
- een lijst `WIPE ...`: wat er gewist gaat worden
- een reeks regels `POST-FLIGHT: ...`, met als laatste `POST-FLIGHT OK`
- als laatste: `DRY RUN finished - ... Nothing changed.`

Controleer in de `POST-FLIGHT`-regels:

- `exactly 6167 eligible cards` (het aantal na de stemming; vóór de stemming was het 6136).
- `rarities live - Legendary 21, Secret Rare 219, Ultra Rare 1103, Super Rare 1270, Rare 1513, Normal 2041`
- het juiste aantal spelers bij `league memberships (roles unchanged)`.
- `14 Boss Paths active (stage prices 1800 / 3200 / 5500)`. Staat daar `900 / 1400 / 2400`? Dan is stap 2b niet gelukt: **STOP** en doe eerst stap 2b.

**STOP als:** je `ERROR` of `ABORTED` ziet. Er is dan niets veranderd. Kopieer de melding en vraag om hulp.

### Stap 4: De echte reset

Precies hetzelfde commando, maar nu met `mode=apply`:

```
psql "$DB" -v ON_ERROR_STOP=1 -v launch_date=2026-10-30 -v mode=apply -f scripts/season2/reset-and-activate.sql
```

Als laatste regel moet je `SEASON 2 RESET APPLIED (committed).` zien.

**Wat er gebeurt:**

- Gewist: alle kaarten, alle DP, decks, potjes, competities, drafts, Boss-voortgang, luck, vouchers, weekdoelen, Season Path, minigame-scores en ruilen.
- Blijft: alle accounts, wachtwoorden, de league en wie er lid is. Ook blijft wie admin is, dus jij blijft admin. Seizoenstitels blijven ook.
- Daarna: de Classic-pool gaat aan, de nieuwe zeldzaamheden gaan in, en Seizoen 2 begint op de gekozen datum.

**STOP als:** je `ERROR` ziet. Het script is één geheel. Bij een fout wordt **alles** teruggedraaid, en is er dus niets veranderd. Vraag dan om hulp.

### Stap 5: De nieuwe app live zetten

**Vooraf in Vercel (verplicht):** `SUPABASE_SECRET_KEY` moet gezet zijn voor **Production** (server-only env var, nooit `NEXT_PUBLIC_`). Zonder die sleutel kan niemand een titel kiezen op zijn profiel, ook niet de titel "Season 2 Champion" (de minigames staan uit, die gebruiken hem nu niet).

Pas nu wordt de `v2`-branch samengevoegd met `main`. Vercel zet de nieuwe app dan vanzelf live.
Laat dit door de ontwikkelaar doen, of doe het zelf als je weet hoe.
Wacht tot Vercel "Ready" zegt.

### Stap 6: Controle op je telefoon

Log in op `https://yugiohmasters.vercel.app` en loop dit rijtje af:

1. Je komt automatisch bij het **Boss Path-rad**. Op het rad staan de routes die nog niemand in de league heeft (bij de eerste speler alle **14**). Tik op **Spin the Wheel**: het rad draait een paar seconden en stopt op jouw route. Daarna zie je de route met plaatje, verhaal, "How it plays" en je Stage 1-kaart. Ververs de pagina: je ziet dezelfde route, geen rad meer (één keer draaien, nooit opnieuw). Tik op **Continue to your Initial Draft**.
2. Daarna start de **Initial Draft**. Kies alle kaarten. Controleer dat je geen Synchro-kaarten ziet en geen kaarten van na 2014, behalve de bekende uitzonderingen zoals Chocolate Magician Girl.
3. Na de draft heb je **3 welkomstpacks**: 1 Standard (Normal), 1 Premium en 1 Deluxe. Open ze in de Shop.
4. **Wallet**: je DP begint op 0. Na het openen van 2 packs krijg je meteen 150 DP van het weekdoel "Open 2 packs"; dat is goed.
5. **Deck builder**: probeer 2× Foolish Burial in één deck te doen. De tweede moet geweigerd worden ("limited to 1 per deck"). Raigeki mag 1×.
6. **Home**: er staat "Season 2 · Week 1".
7. Laat de andere twee spelers hetzelfde doen. Controleer dat jullie alle drie een **andere** route hebben (het rad geeft een route maar één keer per league).

**STOP als:** iets hiervan niet klopt. Maak een schermafbeelding en vraag om hulp.

### Als het echt misgaat (na stap 4)

Zet de back-up van stap 1 terug: **Supabase Dashboard → Database → Backups → Restore**.
Dat zet alles terug naar het moment van de back-up.

---

## Technical appendix (English)

### Every 2.0 migration (2026-10-12 / 14 / 15 / 30), in apply order

Apply with the loop in step 2 (`2026101[245]*.sql` then `20261030*.sql`). Two special cases:

- **`202610120500_card_votes.sql` must be SKIPPED on production.** Production already has the live vote (applied 2026-10-12 via `manual_deploy/20261012_live_vote_and_hotfix.sql`, i.e. the `202610121900` version). Re-running `202610120500` there fails with `cannot change return type of existing function` on `get_vote_results` (verified on the local DB, 2026-10-15) and would stop the loop. The loop in step 2 skips it.
- **`202610121900_card_votes_live.sql` is already applied on production (2026-10-12) and is safe to run again.** Everything in it is `create table if not exists` / `add column if not exists` / guarded constraint blocks / `create or replace` / `drop ... if exists` + re-create (trigger, policies, the three RPCs, all inside one `begin`/`commit`), and grants are re-applied. Re-running it is a no-op for data (verified on the local DB, 2026-10-15). Skipping it is fine too.

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
| `202610121030_classic_v2_format_seed.sql` | **Generated** (`scripts/cardpool/build-v2-format-migration.mjs`). Adds 151 OCG-only Master Duel cards to `card_catalog` (`format_eligible = false`, MD status `unknown`); the inactive format row `duelist_circle_classic_v2`; 6,136 include overrides; 185 banlist rows (100 forbidden / 70 limited / 15 semi); 6,136 proposed rarities (Legendary 45 / Secret 200 / Ultra 1,145 / Super 1,193 / Rare 1,509 / Normal 2,044). Ends with count assertions. Re-runnable: it replaces this format's rows and never touches `is_active`. Superseded after the group vote by `202610301200`. | card pool |
| `202610121100_perk_weekly_cap.sql` | Weekly cap on perk (real-life achievement) DP: `perk_config.weekly_dp_cap` (default 600, null = no cap), ISO week in Europe/Amsterdam on approval time; `approve_achievement_claim()` refuses approvals over the cap (claim stays pending); `perk_dp_this_week()` read helper. | rewards |
| `202610121110_shadow_arena_title.sql` | `_mini_game_title()` labels the auto battler "Shadow Arena" in reward descriptions / ledger notes (game key stays `auto_battler`; old ledger rows keep their text). | auto battler |
| `202610121200_security_review_fixes.sql` | Security: RLS + no client rights on `season1_welcome_bonus_claims` (closes repeatable welcome-pack claims); `perk_dp_this_week` no longer callable by anon; drops default write grants on the 2.0 season / weekly-goal / title tables. Additive. | security |
| `202610121210_mini_game_submit_service_only.sql` | Security: `submit_game_run` / `reject_game_run` get an explicit `p_profile_id` and become service-role only (old signatures dropped), so scores only land after the server-side replay. Needs the 2.0 server actions deployed. | mini games |
| `202610121220_competition_submit_guards.sql` | Security: `submit_competition_match_result_v2` refuses non-admin results unless the competition is `active` and the match is not cancelled / declined / completed. Admins unchanged. | competitions |
| `202610121300_shadow_arena_ghosts.sql` | Shadow Arena: friends' ghost boards (snapshots + frozen per-run ghost list), service-role only; auto_battler max score. | arena_board_snapshots, arena_run_ghosts |
| `202610121310_shadow_arena_lanes.sql` | Shadow Arena lanes: `board_schema` on snapshots, ghost selection by schema instead of engine version. | arena_* |
| `202610121400_trade_deck_guards.sql` | Trades refuse wager-locked cards and cards in competition-locked decks; deck add/remove only for Draft decks. | trades, decks |
| `202610121500_play_season_fixes.sql` | Ledger `seq` (stable order), `competitions.is_season` flag (+ back-fill rule — **check with owner**), admin result guards, loser's wager escrow marked `lost`. | ledger, competitions, wagers |
| `202610121600_shop_pack_league_wide_scarcity.sql` | Pack pickers count copies league-wide (no more random 'scarcity limit' failures); Legendary luck kept when none available; Monster-Type Special Pack allowed. | shop |
| `202610121610_signup_league_capacity.sql` | `private_league_has_room()` so a 4th signup is refused before an account is created. | auth |
| `202610121620_custom_title_server_only.sql` | Players can no longer write `custom_title` directly. **Breaks title equip on the old main app — apply on launch night only.** | profiles |
| `202610121630_admin_config_editor.sql` | Admin-only `admin_set_config_value` for the real economy config (fixed key list). | config |
| `202610121640_welcome_bonus_label.sql` | Welcome vouchers labelled 'Welcome bonus' (season-agnostic). | vouchers |
| `202610121650_standard_pack_name.sql` | Display name of pack `normal` → 'Standard Pack' (codes unchanged). | shop |
| `202610121700_trade_privacy_season_start_bounty_wording.sql` | Draft trades visible only to their creator (+ `save_trade_draft_message`), one-transaction `start_season_competition`, clearer reversed-bounty wording. On old main, the sender's link to a counter still in draft shows a 404. | trades, competitions |
| `202610121710_boss_stage1_achievements_english.sql` | Translates the 9 Dutch stage-1 Boss achievement labels. | boss achievements |
| `202610121800_season_result_confirmation.sql` | A player-entered season result only counts after the opponent confirms (new confirm/dispute/withdraw RPCs; admin who isn't playing = referee). **Changes live behaviour immediately — launch night only.** | competitions, matches |
| `202610121900_card_votes_live.sql` | The live card vote (with "Allow it" rarity). **Already applied on production 2026-10-12**; idempotent, re-running is harmless (see above). | card pool |
| `202610142000_mini_game_catalog.sql` … `202610142060_giza_peaks.sql` | Mini game catalog (`mini_game_catalog`, `register_mini_game`) + the six round-3 games (Pyramid Stack, Millennium Strike, Obelisk Rush, Merge of Ra, Tomb Blocks, Giza Peaks). | mini games |
| `202610152000_shop_rarity_ladder_fallback.sql` | `pick_shop_pack_card`: a rolled / guaranteed rarity with no free copy left falls DOWN the ladder (Legendary → Secret → Ultra → Super → Rare → Normal) before the old "any rarity" fallback. Legendary luck unchanged (only reset by a real Legendary). Same signature. | shop |
| `202610152010_admin_own_duel_needs_opponent_ok.sql` | New table `match_result_proposals`. An admin who PLAYS in the duel: correction (`correct_competition_match_result_v2`), tiebreak result and practice dispute resolution (`resolve_disputed_match`) become proposals; the opponent accepts / rejects (`accept_` / `reject_` / `withdraw_match_result_proposal`). Referee (admin not in the duel) unchanged. Also clears dispute fields when a season duel completes. Same signatures. **On old main an admin's own correction silently becomes a proposal (main cannot show it) — launch night only.** | competitions, matches |
| `202610152020_season_champion_title.sql` | Triggers: a finalized season competition gives its #1 the profile title "Season N Champion" (`source = 'season_champion'`); a later correction that changes #1 moves it. Idempotent, nothing back-filled. | profiles, competitions |
| `202610152030_practice_challenge_guards.sql` | Season duels no longer block practice challenges; decline / cancel / wager RPCs refuse season duels; `accept_practice_challenge` (accept + stake in one transaction); no result / no payout on a one-sided wager (refunded instead); either player can cancel a stuck accepted wager duel; an admin may settle a wager. | matches, wagers |
| `202610152040_initial_draft_guards.sql` | Initial Draft strictly one-time (any seat in a non-cancelled draft counts, advisory lock), Boss Route required first; the admin `start_initial_draft` refuses players who had one. | draft |
| `202610152050_small_security_and_goal_fixes.sql` | `consume_reward_voucher` and `_phase*_verify_introspect` no longer callable by anon / players; tiebreak duels don't count for weekly goals. | security, weekly goals |
| `202610301000_boss_routes_v3.sql` | **Generated** (`scripts/generate-boss-routes-v3-migration.mjs` from `data/boss-route-registry-v3.mjs`). The 14 Season 2 Boss Paths (`s2_*` codes, 4 stages + 11 one-copy grants each, `boss_routes.how_it_plays`). The 20 Season 1 routes are retired (`is_active = false`, display order + 100); retired routes no player holds are deleted right away, the rest by the reset script after it wipes `player_boss_paths`. Stage prices are copied from the live config (never hardcoded), so step 2b still sets 1,800 / 3,200 / 5,500. Exemption tightened: `is_boss_route_exempt_card` / `is_boss_route_reserved_card` only see active routes; deck legality through the exemption is per owner (`is_duelist_circle_deck_legal_for`, used by `validate_deck_card`); `duelist_circle_deck_copy_limit` waives a banlist limit only for route cards outside the pool. Aborts if any card name does not resolve. Idempotent. | boss paths, card pool |
| `202610301100_hide_mini_games.sql` | 2.0 launches without mini games: every `mini_game_catalog` game goes inactive (`start_game_run` refuses them) and players can no longer call `settle_mini_game_period` (no mini game payouts). Nothing dropped; idempotent. The app hides `/games` behind `MINI_GAMES_ENABLED` in `src/lib/games/flag.ts`. | mini games |
| `202610301200_classic_v2_format_after_vote.sql` | **Generated** (`build-v2-format-migration.mjs`), the card vote result (`docs/CARD_VOTE_RESULT_2026-10-30.md`, `data/cardpool/vote-results-2026-10-30.json`). Replaces the inactive Classic v2 format's rows from `202610121030`: 6,167 include overrides; 191 banlist rows (69 forbidden / 107 limited / 15 semi; incl. the owner's 3 Boss route balance limits: Shien's Advisor, Ancient Gear Fusion, Chaos Ancient Gear Giant); 6,167 proposed rarities (Legendary 21 / Secret 219 / Ultra 1,103 / Super 1,270 / Rare 1,513 / Normal 2,041); same 151 catalog additions. Ends with count assertions; re-runnable. Must run AFTER `202610121030`. | card pool |
| `202610301300_wager_card_competition_deck_guard.sql` | Launch-rehearsal fix: `add_match_wager_card` (and so `accept_practice_challenge`) refuses a card that sits in a competition-locked deck, like trades already do. Before, such a wager could never settle: the duel completed, the wager stayed `proposed` and both staked cards stayed locked for good. Same patch technique and marker as `202610152030`; same signature; idempotent. SQL test `60_wager_card_deck_lock`. | matches, wagers |
| `202610301400_boss_route_wheel.sql` | **Boss Path wheel** (owner decision 2026-10-30). New `spin_boss_path_wheel()` (players only): picks a random active route with a Stage 1 that no current league member holds, creates the slot-1 path and grants Stage 1 through the same insert + `_boss_route_grant_stage` as before (shared internal `_boss_path_start`), all in one transaction. Idempotent: a second call returns the route already assigned (`newly_assigned = false`), never a new roll. Race-safe: the spin, `choose_boss_path` and `unlock_second_third_boss_path` all take one per-league advisory lock (`_boss_route_claim_lock`) before reading which routes are free. `choose_boss_path(uuid)` keeps its signature and grant but refuses a NEW slot-1 route from the API roles (`anon`/`authenticated`): "decided by the wheel"; a retry for the route a player already holds still returns that path (old main keeps working for existing players). Slots 2/3 (`unlock_second_third_boss_path`) stay a free choice, but a route another member holds is refused before any DP moves. `boss_path_free_routes()` gives the app the free route ids (wheel slices, slot 2/3 grid). No unique index on purpose: before the reset two players may share a retired Season 1 route; retired/inactive routes are never on the wheel. Friendly error when every route is taken. No data changes; idempotent. SQL test `61_boss_route_wheel`. | boss paths, onboarding |

**Backwards compatibility.** These migrations share the production database with the live `main` app.
`202610121000` takes effect immediately: Master Duel-forbidden cards that are already `format_eligible` become offerable in the live draft and shop.
Everything from `202610121010` onward is dormant until a format is active.
So apply the whole set on launch night only, directly followed by the reset script.

### Launch script: `scripts/season2/reset-and-activate.sql`

- psql-only (it uses `\if` / `\gset`). Variables: `launch_date` (required, a date) and `mode` (`dry_run` | `apply`, required). Use it with `-v ON_ERROR_STOP=1`. It is one transaction: `mode=dry_run` ends in ROLLBACK, `mode=apply` in COMMIT.
- **Pre-flight:**
  - every public table must be in the wipe/keep plan, and an unknown table aborts the run (new auto battler tables must be classified first);
  - no kept table may have a RESTRICT / NO ACTION FK to a wiped table;
  - Classic v2 must have 6,167 includes, 6,167 rarities and at least 1 banlist row (6,136 before the 2026-10-30 vote; the script's expected numbers must say 6167);
  - exactly one current season, which is season 2;
  - `launch_date` must be within −7 to +60 days;
  - every league that has members must have an admin;
  - the 14 Season 2 Boss Paths (`s2_*`, 4 stages each) are the only active routes (`202610301000` applied).
- **Wipe (50 tables):**
  - weekly goals (progress, grants, sets), Season Path XP and tier grants, bounty / catch-up grants;
  - mini game runs, settlements and grants;
  - Boss paths, unlocks and events, then the retired Season 1 Boss Routes themselves (`delete from boss_routes where not is_active`, cascades to their stages / grants / achievement rows); pack luck; coach insights; welcome claims;
  - drafts, shop history, pity and vouchers;
  - competitions (and everything that hangs off them), matches, result proposals, wagers and the DP ledger;
  - Shadow Arena ghost boards (`arena_board_snapshots`, `arena_run_ghosts`);
  - trades, decks, P2W claims, ownership history and card instances (`prevent_card_instance_delete_trigger` is disabled and re-enabled around that one delete, inside the transaction);
  - `profiles.duel_points` and `wallets` are set to 0.
- **Kept:**
  - profiles, wallets rows, leagues, `league_members` **with roles** (the admin stays admin, so no `claim_league_admin_if_none` is needed), `profile_titles`;
  - catalog, all config (incl. `mini_game_catalog`), card votes, audit log, wishlists.
  - (2026-10-15: `arena_board_snapshots`, `arena_run_ghosts`, `mini_game_catalog` and the new `match_result_proposals` were missing from the plan, so the pre-flight ABORTED on the local DB. They are classified now; re-run the dry run in the rehearsal.)
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
  - v2 is the only active format, and exactly the 6,167 pool cards are eligible (6,136 before the vote);
  - every pool card has its proposed rarity;
  - the active singles rotation only holds pool cards;
  - exactly the 14 Boss Paths are left (56 stages, every stage 2-4 priced, no retired route);
  - as information only, it prints special packs that have fewer than 40 cards left in the new pool.

**Local dry run (2026-10-12, devstack DB, `launch_date=2026-10-19`):**

- Every assertion passed.
- It would wipe 1,704 rows and reset 4,850 DP across 3 profiles.
- Result: 6,136 eligible cards. Rarities: Legendary 45, Secret 200, Ultra 1,145, Super 1,193, Rare 1,509, Normal 2,044.
- 2026-10-30, after the vote (`202610301100` + `202610301200` on a throwaway copy of the devstack DB, the reset script with 6136 -> 6167): every assertion passed; 6,167 eligible cards; Legendary 21, Secret 219, Ultra 1,103, Super 1,270, Rare 1,513, Normal 2,041.
- The singles rotation was regenerated.
- Everything was rolled back.
- **2026-10-30 launch rehearsal** (fresh `db.mjs reset`, three Season 1 players seeded, then step 2b, step 3 `dry_run` and step 4 `apply` exactly as written with `launch_date=2026-10-30`): every assertion passed, `SEASON 2 RESET APPLIED (committed).`; wiped 1,383 rows; 6,167 eligible cards; Legendary 21 / Secret 219 / Ultra 1,103 / Super 1,270 / Rare 1,513 / Normal 2,041; 14 Boss Paths at 1,800 / 3,200 / 5,500; slots 3,000 / 5,500. Then all three players were onboarded and played a full 3-round season in a real browser (iPhone 13 and 1440x900).

A follow-up smoke test, done in the same rolled-back transaction, also passed:

- `claim_welcome_packs()` granted Normal + Premium + Deluxe again;
- `choose_boss_path` worked (since `202610301400` the first route comes from `spin_boss_path_wheel`; `choose_boss_path` now refuses a new slot-1 route from the API);
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
- **Group vote (2026-10-30).** `rank-pool.mjs` reads `data/cardpool/vote-results-2026-10-30.json`: it cuts the tiers on the PRE-vote statuses (the ranking the group voted on), then lays every changed card's voted rarity / status on top. Freed slots are not refilled (owner), so no card outside the vote moves. Deck limits come from `duelist-circle-proposal.json` (every card the vote allowed is `limited_1_per_deck`, owner). `rank-pool.mjs` no longer rewrites `ranking-vote-lists.json` (the record of what was voted on) unless you pass `--write-vote-lists`.
- **Once a seed has been applied anywhere,** emit a **new** file name. The SQL replaces the format's rows, so a later file supersedes the earlier one.

### Boss-route exemption (owner decided 2026-10-12: exempt = ON)

`duelist_circle_formats.boss_route_exempt` (default **true** in the generated seed).

- **Exempt cards** (since `202610301000`, the 14 Season 2 Boss Paths): `is_boss_route_exempt_card()` covers every `boss_route_stages.evolution_card_catalog_id` (all stages) plus every `boss_route_stage_grants` row with `is_route_exclusive`, of **active** routes only.
- **When true:**
  - an exempt card is **deck-legal for its route owner only**: `validate_deck_card` asks `is_duelist_circle_deck_legal_for(card, deck owner)`, which needs a `player_boss_paths` row on an active route that hands out the card. Another player who got a copy (e.g. by trade) cannot deck it. `is_duelist_circle_deck_legal(card)` stays as the card-level answer;
  - the copy limit is waived only for exempt cards **outside** the pool (`format_eligible = false`, e.g. Secret Six Samurai - Rihan). Route cards inside the pool keep their banlist limit (e.g. Chaos Sorcerer stays semi-limited);
  - exempt cards are still never `format_eligible`, so draft, shop packs and singles never offer one that is outside the pool. Example: Blue-Eyes Alternative White Dragon, a post-2014 stage-2 evolution, stays out of packs.
- **Always blocks, even when true:** `not_available` in Master Duel and an explicit `exclude` override.
- **Design rule for the 14 routes:** a grant is `exclusive` exactly when it is outside the pool (68 pool-external route cards: evolutions + exclusive grants, per `generate-boss-routes-v3-migration.mjs --check` and the local DB on 2026-10-30); in-pool grants stay non-exclusive, so other players can still pull them. Stage-4 Bosses are always reserved (never in packs).
- **Turn it off without regenerating:**
  ```sql
  update public.duelist_circle_formats set boss_route_exempt = false where code = 'duelist_circle_classic_v2';
  ```

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
  - 6,167 includes, 151 catalog additions, 6,167 rarities and 21 Legendaries (after the 2026-10-30 vote), with live `game_rarity` untouched;
  - eligibility is exactly 6,167;
  - deck legality with the exemption on and off;
  - Junk Synchron and Synchro Barrier are out;
  - the unknown-status OCG card is in.

The full suite (`node scripts/sql-tests/run.mjs`) passes: 31 files / 573 checks (2026-10-15, on a fresh `node scripts/devstack/db.mjs reset` followed by `node scripts/devstack/seed-demo.mjs bossg samo` - the shop tests need the local test rarities seed-demo gives the catalog; on QA-dirty data `22_season_bounty_catch_up` can fail).

2026-10-15 additions: `52_shop_rarity_ladder` (A), `53_admin_own_duel_proposals` (B), `54_season_champion_title` (C), `55_practice_challenge_guards` (H1-H3), `56_initial_draft_guards` (M4 + Boss Route), `57_small_security_and_goal_fixes`. E2E: `tests/e2e/05-admin-own-duel.spec.ts` (B proposal -> opponent accepts on the round screen; C champion title + badge).

2026-10-30: the full suite passes with **34 files / 615 checks** (fresh reset + `seed-demo.mjs bossg samo`), including `60_wager_card_deck_lock` (a card in a competition-locked deck can't be wagered). Test bots: `npx playwright test --workers=1` 138 passed (mobile + desktop, 8.3 min). `TZ=UTC npx vitest run` 489 passed, `tsc --noEmit`, `eslint src`, `npm run check:sql` and `npm run build` clean.

2026-10-30 addition: `59_boss_routes_v3` (14 active routes x 4 stages x 11 grants, names resolve, no Synchro/Link/Pendulum, prices copied from config, retired routes cannot be chosen, the exemption works for the route owner only and in-pool route cards keep their limit). Balance: `node scripts/boss-route-balance.mjs --check`; registry: `node scripts/generate-boss-routes-v3-migration.mjs --check`.

### Known follow-ups (not done here)

- **`src/lib/master-duel.ts`** still mirrors the old conservative rule. `isMasterDuelOfferable` uses `copyLimit > 0`, and `evaluateMasterDuelDeckLegality` flags MD-forbidden / limited / unknown cards. The deck builder's "Master Duel check" will therefore warn about cards that are fine in Unlimited rooms. Change it to block only `not_available`, and show our own `duelist_circle_card_limits` instead.
- ~~Deck builder UI blocks `!format_eligible` client-side~~ **Done:** the builder uses `deck_legal` (`format_eligible` or a route-exempt card of the player's own active route, `decks/[id]/_lib/deck-builder-data.ts`) and shows our banlist limits. Verified in the 2026-10-30 rehearsal: the route owner can add Magician's Rod / Dark Magician of Chaos; another player gets a disabled "+". (That Dark Magician route was replaced by Six Samurai later on 2026-10-30; same mechanism, covered by SQL test 59.)
- **No general "max 3 copies per deck" rule** exists server-side, and it never has. Only the banlist limits are enforced. Adding a default of 3 is a new deck rule and needs the owner's OK.
- ~~Welcome voucher labels still say "Season 1 welcome bonus"~~ **Done** in `202610121640` (note "Welcome bonus"; only the internal `source_type` is still `season1_welcome_bonus`).
- **Test bots and the 2.0 numbers:** `tests/e2e/economy-rules.ts` has no 2.0 rule set yet, and the bots' global setup resets the local DB **without** step 2b, so they check the old placement numbers (400 / 300 / 200) on purpose. Switching them to 2.0 needs both: a `RULES_2_0` object (placements 350 / 200 / 100) and a global setup that applies `supabase/proposals/season2_numbers.sql` after the reset. Developer task, not a launch-night step.
- **Card wager picker** (`matches/new`, and the accept form on `matches/[id]`) still lists cards that sit in a competition-locked deck. Since `202610301300` picking one gives a clear error ("…locked for a competition and cannot be wagered") and the half-made challenge is cancelled; hiding them from the list is a nicer follow-up. Edge case still open: a card that was staked **before** its deck got locked (wager first, season start after) can still not settle.
- **Season finalize:** when a non-admin confirms the last duel of the season, the season does not finalize itself; the admin gets "Season ready to finalize" under Attention and taps **Finalize Competition** (verified 2026-10-30).
