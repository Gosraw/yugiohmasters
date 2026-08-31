---
title: Phase 1 Live Smoke Test
---

Run this after `node --env-file=.env.local scripts/verify-phase1-live.mjs` reports OVERALL: PASS (or PASS WITH WARNINGS). It confirms the automated checks match real player-facing behavior. Needs a round-robin competition with 3 players and at least one full round still to play.

1. Open **Competitions**, open (or create) a round-robin competition with all 3 league members added.
2. On the competition page, confirm the **Round Overview** section shows "Current Round" / "Completed" / "Upcoming" labels per round, matching what you'd expect from the schedule.
3. Play a normal (non-tiebreak) match and submit its result as a win for one player. On the result form, confirm the inline summary shows **+100 DP** for the winner and **+50 DP** for the loser (or **+75 DP** each on a draw).
4. Open **DP Wallet** (linked from Explore, or the dashboard's DP tile — page title "Duel Points") for the winning player and confirm the new match-reward transaction appears with the correct amount and a "match_reward" reason.
5. Submit the final remaining match in that round. On this submission's result summary, confirm a **ROUND COMPLETE** section appears showing **+250 DP + 1 Premium Pack** for every player who played in the round, and **+150 DP + 1 Standard Pack** for the match winner(s) of that round.
6. Back on the competition page, confirm that round now shows a **"Rewards granted"** tag next to its "Completed" label, and the DP Wallet page for each player shows the new round-reward transactions.
7. Complete every remaining match in the competition (including any tiebreak, if one triggers). On the final submission, confirm a **COMPETITION COMPLETE** section appears in the result summary.
8. On the competition page's **Final Results** section, confirm each player shows the correct placement DP/voucher pills (1st: +300 DP + 1 Premium Pack, 2nd: +150 DP + 1 Standard Pack, 3rd: no additional DP pill) reflecting what was actually granted, not a generic "distributed" message.
9. Open **Shop**, confirm the new Premium/Standard Pack vouchers from steps 5-8 appear in the vouchers panel with the right counts, and open one pack using "Use Voucher" to confirm it actually resolves to a real pack opening (not a dead button).
10. Refresh the competition page and the DP Wallet page for all 3 players. Confirm no reward, voucher, or DP transaction appears twice — re-loading the page must not duplicate anything from steps 3-8.

If a Legendary card is pulled during step 9 (or any other pack opening), have a second player attempt to pull the same card from the same pack pool repeatedly until the pity/guarantee mechanic forces another Legendary roll. Confirm the second player never receives their own copy of the same card — the pack should reroll to a different card once the first copy exists anywhere in the league.
