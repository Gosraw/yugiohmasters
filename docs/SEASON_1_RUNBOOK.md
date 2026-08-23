# Season 1 Operator Runbook

Exact commands, in order, for actually rolling out everything Season 1
prepared. Read [`SEASON_1.md`](./SEASON_1.md) first if you want to
understand *why* each phase exists — this file is just the "what to
type."

Run every command from the project folder (where `package.json` is), and
make sure `.env.local` has your real Supabase credentials before you
start (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` or
`SUPABASE_SERVICE_ROLE_KEY`).

Every phase has a **STOP condition** — if you hit it, stop and don't
continue to the next phase until it's resolved (ask for help if needed).

---

## Phase A — Review

**Command:** none — just read.

Read `docs/SEASON_1.md` and skim the new migration files under
`supabase/migrations/` dated `202608231420` through `202608231520`.

**STOP if:** anything in there doesn't match what you actually want for
Season 1 — this is the point to change your mind before anything touches
your database.

---

## Phase B — Database migrations

**Commands** (via the Supabase CLI, or paste each file's contents into
the Supabase Dashboard's SQL Editor in this exact order if you don't use
the CLI):

```
supabase db push
```

This applies every migration in `supabase/migrations/` that isn't
already applied, in filename order — including the five new ones from
this run:
`202608231420_competition_reward_grants_v1_to_v2.sql` (a bugfix to an
existing migration, additive/idempotent),
`202608231500_duelist_circle_format_engine.sql`,
`202608231510_basic_pack_five_cards.sql`,
`202608231520_season_reset.sql`.

**Expected output:** the CLI lists each migration file name as it
applies, ending without errors.

**STOP if:** any migration errors. Do not proceed, and do not try to
"fix" it by editing an already-applied migration — copy the exact error
and get it looked at.

---

## Phase C — Card audit (report only, no writes)

**Command:**

```
node scripts/audit-card-valuation.mjs
```

This is a dry run by default — it only writes local report files to
`reports/card-valuation/<timestamp>/`, never your database. Open
`REPORT.md` in that folder and review it: the rarity distribution
before/after, the biggest Legendary downgrades, the biggest Normal
upgrades, and anything flagged for manual review.

Optional, once you've reviewed the report and are happy with it:

```
node scripts/audit-card-valuation.mjs --write-scores
```

This writes the computed scores into new `proposed_*`/`*_score` columns
only — it still never touches your live `game_rarity`. That stays a
separate, manual decision (see Phase D).

**Expected output:** a summary printed to the terminal, plus the report
files. With `--write-scores`, a count of rows updated.

**STOP if:** the report shows something that looks clearly wrong for a
specific well-known card — that's exactly what this review step is for.

---

## Phase D — Approve/apply valuation (manual, NOT automated)

This phase is deliberately **not a single command** — copying the
`proposed_game_rarity` column into the live `game_rarity` column (and
setting `release_stage`/`format_eligible`) is a decision this run was
explicitly told not to make for you.

Once you've reviewed Phase C's report and decided you're happy with it,
in the Supabase SQL Editor:

```sql
update public.card_catalog
set
  game_rarity = proposed_game_rarity,
  rarity_score = draft_value_score,
  rarity_reason = valuation_reason,
  rarity_needs_review = false
where proposed_game_rarity is not null
  and rarity_manually_overridden = false;
```

Review the `where` clause before running it — adjust it if you want to
apply this to only a subset of cards first.

**STOP if:** you're not confident about this yet. There's no time
pressure — Draft and Shop keep working fine on the current rarity until
you do this.

---

## Phase E — Pre-reset backup

**Steps** (not a script — see §3 of `SEASON_1.md`):

1. Supabase Dashboard → your project → Database → Backups → create a
   manual backup (or run your own `pg_dump` if you're comfortable with
   that).
2. Run `node scripts/season-reset.mjs` (no `--apply` — this is the dry
   run) and save its printed row counts somewhere, so you have an exact
   record of what a restore would need to bring back.

**STOP if:** you can't confirm a backup was actually created — don't
proceed to Phase G without one.

---

## Phase F — Reset dry run

**Command:**

```
npm run season:reset
```

You'll be asked to sign in with your own admin account's email and
password (this is required — see `SEASON_1.md` §2 for why a service-role
key can't do this step). This only calls the read-only preview — it
changes nothing.

**Expected output:** a full table of what would be reset and what would
be kept, with row counts, ending in "Dry run only... Nothing was
changed."

**STOP if:** the counts don't match what you expect (e.g. it lists a
table you didn't expect to lose, or a count that seems way too
high/low) — investigate before going further.

---

## Phase G — Reset apply (destructive)

**Command:**

```
npm run season:reset:apply
```

Same sign-in as Phase F, then you'll be shown the preview again and
asked to type the exact phrase `RESET DUELIST CIRCLE SEASON` to confirm.
Get it wrong and nothing happens. Once confirmed, it deletes everything
listed as "RESET" in the preview, then deletes the old login accounts
too.

**Expected output:** the row counts again, then "season_reset_apply()
succeeded" with a list of reset profile ids, then a login-deletion
progress list, ending in "SEASON RESET COMPLETE" and a reminder that
nobody has the admin role yet.

**STOP if:** it errors partway through — because this runs as one
database transaction, an error means **nothing was changed at the
database level** (safe to just retry), but check whether any login
accounts were already deleted before the error (the script tells you
exactly which ones succeeded/failed) and finish those manually in the
Supabase Dashboard if needed.

---

## Phase H — New user smoke test

**Steps:**

1. Have every real player (gossie, fardin, samochamo) register a new
   account the normal way, through the app.
2. Confirm each of them can join the league (this happens automatically
   on registration/onboarding) and pick a Boss Monster.
3. **Restore admin access** — have ONE player run, from the Supabase SQL
   Editor while signed in as themselves (or via any authenticated
   client):
   ```sql
   select public.claim_league_admin_if_none('<the league's id>');
   ```
   This only succeeds while the league truly has zero admins, so it's
   safe — it can't be used to take over an already-administered league.
4. From there, do a normal walkthrough: draft, collection, deckbuilder,
   shop, trade, competition — using the app itself, not scripts.

**Expected result:** everything works exactly like a brand new league.

**STOP if:** nobody can register with a previously-used username/duelist
name — that would mean the reset didn't fully clear something; don't
keep going, get it looked at.

---

## Phase I — Push / deploy

**Steps:**

1. Review `git log` locally — every commit from this run is local only,
   nothing has been pushed.
2. When you're ready: `git push`.
3. Deploy as you normally do (e.g. Vercel picks up the push
   automatically, if that's how this project is set up).

**STOP if:** you're not ready to go live yet — there's no rush, nothing
above requires pushing immediately.

---

## Later, whenever you're ready (not required for Season 1 itself)

- **Activate the Duelist Circle format:** insert/activate a row in
  `duelist_circle_formats` (the seeded, inactive "season_1" row is a
  ready-made starting point), then call
  `select public.recompute_format_eligibility();` as an admin. This is
  the one command that actually changes which cards Draft/Shop offer.
- **Format cutoff numbers:** `node scripts/sync-card-release-dates.mjs`
  (backfills real release dates), then
  `node scripts/audit-format-cutoffs.mjs` (prints the 2019 vs 2020 vs
  2021 comparison against your real catalog).
- **Draft value proof:** run `scripts/audit-card-valuation.mjs`'s JSON
  export, then
  `node scripts/simulate-draft-value.mjs --proposal <path-to-full-proposal.json>`
  for real draft-value-by-rarity numbers.
