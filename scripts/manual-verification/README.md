# Manual verification scripts

This sandbox has no network access to the real Supabase project (see
`scripts/compute-synergy-graph.mjs`'s header for the same disclosed
limitation on the synergy precompute script). These `.sql` scripts
exist because two of this session's fixes - A1 (shop loose-card
purchase) and A4 (competition deck lock) - are pure PL/pgSQL trigger
and function logic that can only be truly proven correct by running
against a real Postgres instance with the app's full schema, RLS, and
`auth.uid()` context.

Both scripts:
- Run entirely inside `BEGIN ... ROLLBACK`, so running them leaves
  your database exactly as it was - safe to run more than once.
- Create their own throwaway league/card/deck/competition fixtures, so
  they don't depend on (or disturb) any real league data.
- Need exactly one thing from you: a real `public.profiles.id` from
  the database you're testing against, substituted in place of the
  `00000000-0000-0000-0000-000000000000` placeholder near the top of
  each script.
- Print `PASS`/`FAIL` `NOTICE` lines for every assertion - read the
  output, don't just check that the script didn't error.

**Never run these against production.** Point them at a staging or
local dev Supabase project only, after applying the relevant migration
there (`202608250900_fix_shop_rotation_card_purchase.sql` for A1,
`202608250930_competition_deck_lock.sql` for A4).

- `verify-a1-shop-purchase.sql` - proves a league member can buy an
  available loose/rotation shop card exactly once, with a correctly
  populated `card_instances` row (the original bug: this always
  failed), and that a second attempt on the same slot fails cleanly
  with no double charge. Needs an authenticated request context for
  `auth.uid()` to resolve inside `purchase_shop_rotation_card()` - see
  the script's own comment for how to run it that way (typically via
  an authenticated Supabase client call for the test account rather
  than the raw SQL editor, which runs as postgres/service role).
- `verify-a4-competition-deck-lock.sql` - proves a deck is freely
  editable before a competition starts, becomes fully locked (cards
  frozen, status/is_active frozen, can't switch to another deck
  mid-competition) the moment the competition leaves `draft`, and that
  the player regains the ability to use OTHER decks (but the locked
  deck itself stays frozen forever) once the competition completes.
  Runs entirely via SECURITY DEFINER functions driven by table state,
  so it does not need an authenticated session - the raw SQL editor is
  fine.
