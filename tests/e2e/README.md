# Test bots (end-to-end tests)

## Samenvatting (voor Gosraw)

**Wat zijn de test bots?** Drie nep-spelers (bossg, samo en fardin) die
de echte app gebruiken zoals jij dat op je telefoon doet: inloggen,
op knoppen tikken, kaarten kiezen, packs openen en uitslagen invullen.
Ze spelen alleen op de **lokale testdatabase** op deze Mac, nooit op de
echte app of de echte database.

**Wat controleren ze?**

1. **Rondje door de app** – elke speler opent elk scherm (Home, Play,
   Cards, Shop, Profile, Wallet, …). Een scherm faalt als het een
   foutmelding toont, als er een fout in de achtergrond optreedt, of als
   het op een telefoon breder is dan het scherm (zijwaarts scrollen).
2. **Nieuwe speler** – fardin begint helemaal opnieuw: Boss Path kiezen,
   alle 64 draft-kaarten kiezen, welkomst-packs openen, en dan naar Home.
   Daarna wordt in de database nagekeken of hij precies 64 draft-kaarten
   heeft en of de packs precies één keer gegeven zijn.
3. **Beloningen tellen** – de drie spelen samen één volledige ronde
   (iedereen tegen iedereen = 3 potjes). Daarna wordt tot op de laatste
   DP nagerekend: winst 100, verlies 75, iedereen +300 DP + 1 Premium
   pack, nummer 1 +400 DP + 1 Normal pack, nummer 2 +300, nummer 3 +200.
   Ook wordt gecontroleerd dat niets dubbel wordt uitbetaald als een
   uitslag opnieuw wordt ingevuld of een pagina wordt ververst, en dat
   een gecorrigeerde uitslag de ronde-beloningen netjes herberekent.
4. **Shop** – samo koopt een Normal pack met DP: er moeten precies 7
   kaarten bij komen en precies 300 DP af gaan, één keer.

De beloningsgetallen staan op **één plek**: `tests/e2e/economy-rules.ts`.
Als de 2.0-getallen zijn goedgekeurd, hoeft alleen dat bestand aangepast.

**Hoe start je ze?** (de testdatabase, gateway en dev-server moeten
draaien – zie "Requirements" hieronder)

```bash
npm run test:e2e          # alles, telefoon én desktop
npm run test:e2e:mobile   # alleen telefoon-formaat
```

Let op: een run **wist eerst de lokale testdatabase** en bouwt hem
opnieuw op (duurt een paar seconden). Groen = goed. Rood = er is iets
kapot; het verslag staat dan in `.devstack/e2e-report` (openen met
`npx playwright show-report .devstack/e2e-report`).

Tests met de status **"skipped / fixme"** zijn echte bugs in de app die
de bots gevonden hebben. Ze staan hieronder bij "Bugs found". Zodra een
bug is opgelost, haal je `.fixme` weg en moet de test groen worden.

---

## Details (English)

### Requirements

All local, never production:

| What | Command | Address |
| --- | --- | --- |
| Test database (native Postgres) | `node scripts/devstack/db.mjs start` | `127.0.0.1:54322` |
| Supabase-compatible gateway | `node scripts/devstack/gateway.mjs` | `127.0.0.1:54321` |
| App dev server | `node scripts/devstack/dev.mjs 3100` | `http://localhost:3100` |

Playwright reuses a running dev server on port 3100 (or starts
`dev.mjs` itself). Only Chromium is installed; the `mobile` project
uses the iPhone 13 viewport/touch/user-agent on Chromium.

### What a run does

`tests/e2e/global-setup.ts`:

1. Refuses to run unless the app is on `localhost` and the gateway
   answers on `127.0.0.1:54321`.
2. `node scripts/devstack/db.mjs reset` – wipes and rebuilds the local
   DB (skip with `E2E_SKIP_RESET=1` to keep the current state; specs
   that need a fresh player then skip themselves).
3. Clears the season-1 "welcome packs already claimed" markers for the
   three test users (the season-1 deploy hard-codes them for the real
   players), so they are new players like after the 2.0 light reset.
4. Waits for PostgREST to come back, then runs
   `scripts/devstack/seed-demo.mjs bossg samo`: makes the local catalog
   playable and onboards bossg + samo through the real RPCs. fardin
   stays fresh for the onboarding spec.

Specs run one at a time (`workers: 1`) in file order, first the
`mobile` project, then `desktop` (onboarding is mobile-only: it can
only happen once per player). All money assertions are deltas, so the
desktop pass can run on the same DB after the mobile pass.

| Spec | What it checks |
| --- | --- |
| `01-onboarding.spec.ts` | fardin: Boss Path select → Initial Draft (64 real taps) → Home; DB: 64 draft cards, 60/2/2, no DP; welcome vouchers granted once and opened in the Shop (+pack sizes in cards, no DP) |
| `02-smoke.spec.ts` | each user logs in through the form; 17 main routes: HTTP < 400, not redirected, no error boundary / 404 text, no console errors, no horizontal overflow on mobile |
| `03-economy.spec.ts` | admin creates a 3-player competition (RPCs), records the 3 winners on `/competitions/[id]`; exact match DP + full-round rewards + vouchers per player; an outsider can't submit; resubmit / re-settle / refresh grants nothing; wallet shows the rewards; a corrected result re-settles the round exactly (2.0 fix) |
| `04-shop.spec.ts` | Normal pack price/size match the rules; buying via the Shop page: +7 cards, −300 DP, one purchase row; reload doesn't re-buy; the spend is in the DP ledger once |

### Helpers

- `helpers/auth.ts` – `login(page, username)` through the real form;
  `saveLogin` / `storageStatePath` to reuse a session.
- `helpers/db.ts` – `postgres` client hard-wired to `127.0.0.1:54322`:
  balances (`profiles.duel_points` is the real DP balance;
  `wallets.duel_points` is an unused phase-1 leftover), card counts,
  vouchers, onboarding state, `creditDp` (via `_credit_duel_points`).
- `helpers/ledger.ts` – DP ledger assertions:
  `expectLedgerMatchesBalance` (sum of `duel_point_transactions` ==
  balance), `expectLedgerDeltaMatchesBalanceDelta`,
  `expectNoDuplicateGrants` (unique per reason+match and
  reason+competition+round), `expectGrantsExactlyOnce`.
- `helpers/api.ts` – call RPCs as a player (their own JWT) through the
  gateway.
- `helpers/shop.ts` – buy a pack with DP / redeem a voucher on the Shop
  page and skip the reveal.
- `helpers/page-checks.ts` – console-error collector, error-boundary
  and horizontal-overflow checks.
- `economy-rules.ts` – the single source of expected numbers
  (`ACTIVE_RULES`).

### `scripts/devstack/seed-demo.mjs`

```bash
node scripts/devstack/seed-demo.mjs              # all three users playable
node scripts/devstack/seed-demo.mjs bossg samo   # only these
node scripts/devstack/seed-demo.mjs --catalog    # only make the catalog playable
node scripts/devstack/seed-demo.mjs --welcome fardin   # claim_welcome_packs as fardin
```

A fresh devstack catalog has no `game_rarity` and `master_duel_status`
is `unknown` for every card (production filled those in with the rarity
pipeline, which migrations don't replay), so the draft and every pack
fail with "No rarity has enough available cards". `seed-demo` gives
cards a **local test rarity**: the real Legendary / Secret Rare name
lists from `scripts/generated/*_NAMES.txt`, a deterministic hashed
Normal/Rare/Super/Ultra split for the rest, and `unlimited` MD status.
It never overwrites a rarity a migration set. Rarity-dependent numbers
(pack contents, draft offers) are therefore realistic in shape, not
production-exact.

### Bugs found

See the `test.fixme(...)` blocks; each has a comment with the cause.

1. **`proxy.ts` is never loaded – onboarding gate, welcome packs and
   league bootstrap never run** (`proxy.ts:1`). The app lives in
   `src/app`, and Next.js 16 only looks for the proxy next to `app/`,
   i.e. `src/proxy.ts` (`node_modules/next/dist/build/index.js:695`,
   `.../router-utils/setup-dev-bundler.js:270`). Repro: log in and open
   `/login` → 200 instead of a redirect to `/`; a player without Boss
   Path/draft can use every page; `claim_welcome_packs()` (only called
   from `src/lib/supabase/proxy.ts:122`) never runs, so new players get
   no welcome packs. Fix: move `proxy.ts` to `src/proxy.ts`. Fixme
   tests in `01-onboarding.spec.ts`.
2. **Shop DP spending was missing from the DP ledger (live; fixed on
   v2).** `purchase_shop_pack` / `purchase_shop_rotation_card` subtract
   `profiles.duel_points` directly and never insert a
   `duel_point_transactions` row, so the live Wallet never shows shop
   spending and sum(ledger) ≠ balance after any purchase. On `v2` the
   migration `202610120140_shop_singles_boss_route_exclusion.sql` adds
   a trigger that logs it; `04-shop.spec.ts` now guards that.
3. **2.0 launch risk: welcome packs won't be re-granted after the light
   reset.** The season-1 deploy
   (`supabase/manual_deploy/20260902_season1_release.sql:680`) marks
   bossg/samo/fardin as "welcome bonus claimed" forever, and
   `season_reset_apply()` doesn't clear `season1_welcome_bonus_claims`.
   The 2.0 plan says the new season starts with the same onboarding
   incl. 3 welcome packs – the reset must clear that table (and bug 1
   must be fixed for the claim to run at all).

Also relevant, found while these bots were being built (by the
parallel rewards work, not reproduced here because the fix was already
in the test DB): on the live definition, `settle_round_rewards_v2`
crashed on the placement grant of every completed full round
(`column reward_reason does not exist`, rolling back the last result) –
fixed on `v2` by `202610120120_round_rewards_resettle_on_correction.sql`.
`03-economy.spec.ts` would fail on that immediately.

### Flakiness note

While other people edit code, `next dev` hot-reloads ("Fast Refresh").
If that happens during a draft pick, the pick is saved but the screen
keeps the old cards. The onboarding bot then reloads (like a player
would) and records a `stale-draft-screen` annotation in the report; it
fails if this happens more than once in a run.

### Writing more bots

- Use `login(page, user)` for real-UI flows; use `rpcAs(user, fn, args)`
  only for setup that isn't what the test is about.
- Assert money with snapshots before/after (`snapshotAll`) so specs
  don't depend on run order.
- Read reward numbers from `ACTIVE_RULES`, never hard-code them.
- Real app bug? Don't work around it: `test.fixme` + comment + an entry
  above.
