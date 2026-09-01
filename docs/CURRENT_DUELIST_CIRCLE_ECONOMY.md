# CURRENT DUELIST CIRCLE ECONOMY

Source of truth as of the Phase 2 economy-centralization rollout (migrations `202608311100`–`202608311300`). Values below are read live from the database at the file/table named next to each section — this document is a snapshot for humans, not itself the source of truth. If a live value and this document ever disagree, the database wins; re-run `scripts/verify-phase2-live.mjs` to check.

## Matches

Source: `public.league_economy_defaults` (read by `_compute_league_match_reward()`), one row per match, awarded on submission via `submit_competition_match_result_v2()` / `submit_competition_tiebreak_match_result()`.

- Win: +100 DP
- Loss: +75 DP
- Draw: +75 DP

Idempotent via `duel_point_transactions_match_reason_unique` (a match can only pay each side once).

## Round

Source: `public.competition_round_reward_rules` (per-competition copy, seeded from `league_economy_defaults` by `install_default_round_rewards_v2()`), granted by `settle_round_rewards_v2()` once every match in a round is `completed`.

Three tiers, paid on top of match DP, to **every** player registered in the competition for that round (including a bye player who has no match that round):

- Round completion (all registered players): +250 DP + 1 Premium Pack
- 1st place (the round's match winner): +150 DP + 1 Standard Pack
- 2nd place (the round's match loser): +75 DP, no pack
- 3rd place (bye — no match that round): no placement bonus (still receives the +250 DP + Premium Pack above)

**Full round example (one round, one match, one bye — the real 3-player league's structure):**

| Placement | Match DP | Round DP | Placement DP | Pack(s) | Total direct DP |
|---|---|---|---|---|---|
| 1st (won the match) | 100 | 250 | 150 | Premium + Standard | 500 |
| 2nd (lost the match) | 75 | 250 | 75 | Premium | 400 |
| 3rd (bye) | 0 | 250 | 0 | Premium | 250 |

Idempotent via `competition_round_reward_grants_active_unique` (one grant per competition/round/profile/role) plus an `exists()` pre-check inside `settle_round_rewards_v2()`.

## Pack Shop

Source: `public.shop_pack_types` (`price_dp`, `cards_per_pack`), purchased via `purchase_shop_pack()`. Legendary odds corrected 2026-08-31 (Phase 2 follow-up) — see the Phase 2 follow-up report (Special Pack rotation + Legendary odds) delivered alongside this update for the full audit and rationale.

| Pack | Price | Cards | Base Legendary odds | Realized per-pack Legendary EV* |
|---|---|---|---|---|
| Standard (`normal`) | 300 DP | 4 | 0.15% | 0.60% |
| Premium | 900 DP | 5 | 0.30% | 2.20% |
| Special | 1,200 DP | 5 | 0.25% | 3.00% |
| Deluxe | 1,500 DP | 7 | 0.50% | 5.00% |

\* Realized EV includes the pre-existing, unmodified "guaranteed floor card" mechanic (Premium/Deluxe/Special's last card is always forced to at least Rare/Super Rare/Super Rare respectively) — this is why the realized rate is materially higher than the base per-card odds, especially for Deluxe/Special. See the follow-up report's Section 5 simulation for why this makes Legendary pacing faster (weeks, not months, at realistic play volumes) than the base-odds hierarchy alone suggests, and the open human decision it raises.

Standard and Premium packs are also earned free from ordinary play (every round grants a Premium Pack; every round win grants a Standard Pack) — DP purchases of those two tiers are rarely the bottleneck above casual play.

## Special Pack Rotation

Source: `public.shop_special_pack_rotations` + `public.shop_special_pack_slots`, refreshed by `refresh_shop_special_pack_rotation_if_needed()` / `ensure_shop_rotations_current()`, purchased through the same `purchase_shop_pack()` path as the fixed tiers.

- Price: 1,200 DP (5 cards per pack, themed to the active rotation's value).
- Rotation length: 48 hours per active rotation, server-computed and stored (`ends_at`), not client-side random — survives a restart and exposes time-remaining directly from the row.
- Structure (updated 2026-08-31, Phase 2 follow-up): **3 rotating categories** (`attribute`, `archetype`, `monster_type`), one active rotation per category at a time — i.e. **3 special packs active at once**, each drawn from a pre-populated, real-catalog-derived table of 5 slots per category (**15 total configured themes**), advancing deterministically in sequence on each refresh rather than randomly. This meets the Phase 2 economy baseline's "15 configured / 3 active" target. One remaining gap: the Shop UI exposes purchase buttons for only 2 of the 3 categories (`attribute`, `archetype`) — the third (`monster_type`) pack is fully purchasable via the API but needs a small future UI addition to become player-facing.

## Competition (final standings)

Source: `public.competition_reward_rules`, seeded by `install_default_competition_rewards_v2()`, granted by `distribute_competition_rewards_v2()` when a competition (not a single round) finishes. This is a **separate** reward, on top of every round's rewards accumulated during the competition — not to be confused with round placement above.

- 1st place (final standing): +300 DP + 1 Premium Pack
- 2nd place (final standing): +150 DP + 1 Standard Pack
- 3rd place (final standing): +75 DP, no pack

Reversible: a corrected final standing claws back DP (down to what the balance can still cover) and any still-unspent voucher, tracked per grant.

## Tournament

No distinct tournament economy exists. `tournament` is one of two allowed `competition_type` values (the other is `round_robin`) and `'tournament'` is a valid `card_instances.original_acquisition_type` value, but no tournament-specific reward table, rule, or function exists anywhere in the schema — a tournament-type competition would use the exact same `competition_reward_rules` / round-reward mechanism documented above. No tournament reward values are invented by Phase 2, per its own explicit instruction.

## Achievements

No achievement system exists. The only trace is a placeholder league setting, `achievements.default_reward_dp = 0`, and `'achievement'` as an allowed `card_instances.original_acquisition_type` value — no achievement definitions, triggers, or grant function exist. The mechanism a future achievement system would need is already in place and requires no Phase 2 change: `duel_point_transactions.reason` has no check constraint (any new reason string, e.g. `'achievement_bonus'`, can be inserted immediately), and `_credit_duel_points(...)` is a ready-made, ledger-safe entry point for crediting DP from any future source.

## Boss Routes

No Boss Route system exists anywhere in the schema, application code, or settings — no table, column, setting key, or acquisition-type value references it. Nothing to report or preserve; a future Boss Route economy starts from a clean slate. `scripts/simulate-economy.mjs`'s weekly DP output (Sections 18–20) is prepared for that future pricing work, per the Phase 2 directive's own request, but no Boss Route values are invented here.
