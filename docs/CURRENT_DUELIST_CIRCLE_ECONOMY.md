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

Source: `public.shop_pack_types` (`price_dp`, `cards_per_pack`) and, for Special Packs, the active row in `public.shop_special_pack_rotations`. Bought through `purchase_shop_pack()`. Last changed by `202611021000_pack_rebalance.sql` (2026-11-02).

Every pack has one peak roll (`roll_shop_pack_peak_rarity`), which fills one random slot. Every other slot is a filler roll (`roll_shop_pack_filler_rarity`).

| Pack | Price | Cards | Peak: Legendary / Secret / Ultra / Super (rest: no peak) | Filler: Normal / Rare / Super / Ultra | Luck per pack |
|---|---|---|---|---|---|
| Standard (`normal`) | 400 DP | 5 | 0.25% / 2% / 8% / 25% | 75 / 25 / - / - | 0.25 |
| Special (`special_*`) | 1,000 DP | 10 | 1.75% / 13% / 30% / 44% | 35 / 50 / 15 / - | 1.25 |
| Premium | 900 DP | 10 | 2.25% / 15% / 32% / 43% | 30 / 60 / 10 / - | 1 |
| Deluxe | 1,500 DP | 14 | 8% / 38% / 44% / 10% | 5 / 60 / 30 / 5 | 2 |

- A slot whose rarity has no free copy (or isn't in a Special Pack's pool) takes the best rarity below it, and only then the nearest rarity above it.
- No pack holds the same card twice unless the pool leaves no other choice.
- Legendary Luck: at 100 luck the next pack's peak is a Legendary. A pool without a free Legendary gives its best other card and the player keeps their luck. Only a Legendary really pulled resets luck to 0.

Standard and Premium packs are also earned free from ordinary play (see the round rewards above).

## Special Pack Rotation

Source: `public.shop_special_pack_rotations` + `public.shop_special_pack_slots` + the curated pools (`shop_special_pack_definitions`, `shop_special_pack_pool_cards`), refreshed by `refresh_shop_special_pack_rotation_if_needed()` / `ensure_shop_rotations_current()`, bought through the same `purchase_shop_pack()`.

- Price and size: 1,000 DP, 10 cards. Stored on each rotation row; the generator writes these values into every new row.
- Rotation length: 48 hours per active rotation, stored in `ends_at`.
- Structure: 3 categories (`attribute`, `archetype`, `monster_type`), one active rotation each, so 3 Special Packs at once. Each advances in order through 5 slots, one curated pack per slot (15 in total).
- Archetype cap: at most 2 cards with the same `card_catalog.archetype` in one Special Pack, peak included. A null or empty archetype doesn't count. The peak slot is filled first, so the cap never costs the pack its best card. If a slot can't stay within the cap, the cap gives way for that slot; a purchase never fails because of it.

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
