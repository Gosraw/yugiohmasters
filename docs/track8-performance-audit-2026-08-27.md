# Track 8 - Performance / Query Audit (2026-08-27)

Scope: review every query and computation path touched or added during
this session's Tracks 1-7 (AI Coach, competition rewards/DP,
tiebreaks, Monster Type/Race filters, security hardening) plus a
general sweep of `src/app` and `src/lib` for N+1 queries, unbounded
scans, eager AI calls on normal page load, repeated identical server
work, and missing indexes on hot query paths. This is a documentation
deliverable - findings below were investigated but, per the standing
directive for this session ("performance must not regress", prefer a
documented finding over a risky live change this late in a large
session), only fixed where the fix was small and safe. Anything left
open is called out explicitly rather than silently accepted.

## Summary

One pre-existing MEDIUM finding, not introduced this session. Every
query/computation path added or modified this session (Tracks 1, 2,
3, 4-6) was checked and confirmed bounded. No unbounded table scans,
no eager AI calls on page load, and no missing indexes were found on
the query patterns actually used in application code.

## Findings

### MEDIUM - N+1 RPC loop when creating a V2 competition with multiple players

`src/app/actions/competitions.ts`, `createCompetitionV2` (around
line 477): after creating the competition, the action loops over the
selected player ids and issues one `await supabase.rpc(
"add_competition_player_v2", ...)` call per player, sequentially:

```js
for (const profileId of playerIds) {
  const { error } = await supabase.rpc("add_competition_player_v2", { ... });
  ...
}
```

This is a genuine N+1 pattern (one network round trip per invited
player) and pre-dates this session. It is NOT on a normal page render
path - it only runs once, when an admin submits the "Create
Competition" form - and is bounded by league roster size (leagues in
this app are small friend groups, realistically under ~20 members),
so the practical cost is low. Left undocumented before now; flagging
it here rather than fixing it, because a real fix means adding a new
bulk `add_competition_players_v2(target_competition_id, target_
profile_ids uuid[])` RPC and migration, which is schema-surface growth
better done as its own reviewed change than folded into this already
large session. Recommended follow-up for a future session.

## Areas checked - confirmed OK, no new issues

### N+1 loops
Every `for`/`.map()`/`.forEach()` in `src/app` and `src/lib` was
checked for an `await supabase...` call inside the loop body. Every
loop over card/deck/match/player lists (dashboard, decks/[id],
trades/[id], league, achievements, profile, records, activity,
competitions/[id], and this session's new tiebreak panel) operates
purely in-memory on an already-batched query result (`.in(...)` +
`Map` lookups), the same pattern already established throughout this
codebase. The one exception is the pre-existing finding above.

### Unbounded table scans
Every query against `card_catalog`, `card_instances`, `matches`, and
`card_synergy_edges` carries an `.eq()`/`.in()`/`.limit()`. The `/cards`
browse page has no default filter but ends with `.limit(120)`. This
session's widened Coach live-edge supplement
(`src/lib/ai/card-synergy-context.ts`) was specifically re-verified:
all three candidate sources (owned, league-owned, archetype-scoped)
are capped at `LIVE_SUPPLEMENT_CANDIDATE_CAP = 150` and scoped by
`.eq()`/`.neq()` - never a full `card_catalog` scan. The previously
removed 1.46M-row precomputed pairwise synergy graph was NOT
reintroduced anywhere this session. No application code queries
`duel_point_transactions` or `competition_reward_grants` directly -
both are only touched via SECURITY DEFINER RPCs, which run
server-side against indexed columns (see Missing indexes below).

### Eager AI / expensive computation on page load
The dashboard (`src/app/(app)/page.tsx`) calls `getOrRefreshDashboardCoachInsights`,
which is fingerprint-cached and is a deterministic Deck Doctor
re-render, not a live AI call, per its own documented contract - no AI
call fires on dashboard render. The Boss Companion AI
(`buildBossContext`/`askBossCompanion`) only runs from
`POST /api/boss-companion`, triggered on demand by the chat UI. Card
synergy (`getCardSynergyInsight`, this session's Track 1 fix) is only
invoked from `/api/card-synergy/route.ts` - lazily, per card, on
explicit user action (opening a card's synergy panel) - never from any
list/dashboard page's render path. This satisfies the standing
constraint: no AI call on normal page load, anywhere in the app.

### Repeated identical server work
No page was found fetching the same table twice within one request's
data-fetching block. The two `card_mechanics` queries in
`decks/[id]/page.tsx` (deck cards vs. owned-but-not-in-deck cards)
target disjoint id sets, so that's two necessarily-different queries,
not duplicated work. This session's new Track 3 tiebreak fetch in
`competitions/[id]/page.tsx` was added inside the existing
`Promise.all` batch (parallel with, not sequential after, the other
per-competition reads) and is skipped entirely for V1 competitions.

### Missing indexes
Cross-checked every `.eq()`/`.order()` column used against
`card_catalog`, `card_instances`, `matches`, `competition_reward_grants`,
and `duel_point_transactions` in application code against
`supabase/migrations/`. All are covered by an existing index
(`card_catalog_name_idx`, `_archetype_idx`, `_race_idx`,
`_game_rarity_idx`; `card_instances_owner_idx`, `_league_idx`,
`_catalog_idx`, `_locked_idx`; `matches_league_idx`, `_player_one_idx`,
`_player_two_idx`, `_status_idx`, `_competition_round_idx`,
`_tiebreak_idx` [added this session]; `duel_point_transactions_profile_
created_idx`; `competition_reward_grants_competition_idx`). No gap
found for any query pattern actually used.

### This session's new query paths, specifically re-checked
- Tiebreak detection (`detect_and_create_competition_tiebreaks`) groups
  the output of `get_competition_standings_v2`, which is itself bounded
  by the competition's own participant count (never more than a
  league's roster) - not a table scan.
- The reward-correction delta loop (`correct_competition_match_result_v2`)
  iterates exactly 2 rows (the two match participants) via a `values
  (...)` literal, not a query-per-iteration.
- The three Coach live-edge-supplement sources and the Collection/Deck
  Builder/Trade binder Monster Type filters added in Tracks 1 and 4-6
  add zero additional queries per filter interaction: Collection's and
  the binder's filters are server-rendered on a normal page GET (one
  query total, same as every other filter already on that page); Deck
  Builder's and Trade's filters are pure client-side `useMemo` filters
  over data already fetched once per page load.
