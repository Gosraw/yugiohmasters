import {
  expect,
  test,
} from "@playwright/test";

import { ACTIVE_RULES } from "./economy-rules";
import { rpcAs } from "./helpers/api";
import { login } from "./helpers/auth";
import {
  closeDb,
  db,
  leagueIdOf,
  profileId,
} from "./helpers/db";
import {
  competitionDp,
  expectGrantsExactlyOnce,
  expectLedgerDeltaMatchesBalanceDelta,
  expectNoDuplicateGrants,
  snapshotAll,
  type ExpectedGrant,
  type LedgerSnapshot,
} from "./helpers/ledger";
import { ensureOnboarded } from "./helpers/seed";
import {
  ADMIN,
  USERNAMES,
  type Username,
} from "./helpers/users";

// Economy bot: one full competition round with all 3 players
// (everyone plays everyone once = 3 matches). The admin records each
// winner on the competition page, then every DP / voucher grant must
// match economy-rules.ts exactly - and nothing may be paid twice when
// a result is resubmitted or pages are refreshed.

// Who wins each pairing -> a clear 1st / 2nd / 3rd (no tiebreak).
const WINNER_OF: Record<string, Username> = {
  "bossg|samo": "bossg",
  "bossg|fardin": "bossg",
  "fardin|samo": "samo",
};

const EXPECTED_PLACE: Username[] = ["bossg", "samo", "fardin"];

type MatchRow = {
  id: string;
  player_one_id: string;
  player_two_id: string;
  round_number: number;
};

test.describe.configure({ mode: "serial" });

let competitionId = "";
let matches: MatchRow[] = [];
let before: Record<string, LedgerSnapshot>;
const ids: Record<string, string> = {};
const names: Record<string, Username> = {};

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureOnboarded(USERNAMES);

  for (const username of USERNAMES) {
    ids[username] = await profileId(username);
    names[ids[username]] = username;
  }
});

test.afterAll(async () => {
  await closeDb();
});

function pairKey(match: MatchRow) {
  return [names[match.player_one_id], names[match.player_two_id]].sort().join("|");
}

// Total DP one full round should pay a player, from the rules.
function expectedRoundDp(username: Username, winnerOf: Record<string, Username>, places: Username[]) {
  const rules = ACTIVE_RULES;
  const place = places.indexOf(username);
  const matchDp = matches
    .filter((m) => [m.player_one_id, m.player_two_id].includes(ids[username]))
    .reduce((sum, m) => sum + (winnerOf[pairKey(m)] === username ? rules.match.winDp : rules.match.lossDp), 0);

  return matchDp + rules.round.participation.dp + rules.round.placements[place].dp + (rules.competitionEndDp[place] ?? 0);
}

test("admin sets up a 3-player competition (one full round)", async () => {
  const leagueId = await leagueIdOf(ADMIN);
  const created = await rpcAs<string>(ADMIN, "create_competition_v2", {
    target_league_id: leagueId,
    target_name: `Bot round ${new Date().toISOString()}`,
    target_meetings_per_pairing: 1,
    target_match_format: "single_duel",
  });

  expect(created.error).toBeNull();
  competitionId = String(created.data);

  for (const username of USERNAMES) {
    const added = await rpcAs(ADMIN, "add_competition_player_v2", {
      target_competition_id: competitionId,
      target_profile_id: ids[username],
    });

    expect(added.error, `add ${username}`).toBeNull();
  }

  const scheduled = await rpcAs(ADMIN, "generate_round_robin_matches_v2", {
    target_competition_id: competitionId,
  });

  expect(scheduled.error).toBeNull();

  matches = (await db()`
    select id, player_one_id, player_two_id, round_number::int as round_number
    from public.matches
    where competition_id = ${competitionId}
    order by round_number
  `) as unknown as MatchRow[];

  expect(matches, "3 players -> 3 matches per full round").toHaveLength(3);
  expect(matches.map(pairKey).sort()).toEqual(Object.keys(WINNER_OF).sort());

  before = await snapshotAll(USERNAMES);
});

test("a player who is not in the duel (and not admin) cannot record it", async () => {
  // Live rule: admin only. 2.0 (202610120600_tap_winner_duels): either
  // player of the duel or an admin. Both refuse an outsider.
  const outsiderMatch = matches.find((m) => pairKey(m) === "bossg|samo");

  expect(outsiderMatch).toBeTruthy();

  const attempt = await rpcAs("fardin", "submit_competition_match_result_v2", {
    target_match_id: outsiderMatch?.id,
    target_player_one_duel_wins: 1,
    target_player_two_duel_wins: 0,
  });

  expect(attempt.error ?? "").toMatch(/admin/i);

  const [row] = await db()`select status::text as s from public.matches where id = ${outsiderMatch?.id ?? null}`;

  expect(row.s).not.toBe("completed");
});

test("the admin records all 3 winners on the competition page", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page, ADMIN);

  for (const match of matches) {
    const winner = WINNER_OF[pairKey(match)];

    await page.goto(`/competitions/${competitionId}`);

    const form = page.locator(`form:has(input[name="match_id"][value="${match.id}"])`).first();

    await form.scrollIntoViewIfNeeded();
    await form.getByRole("button", { name: `${winner} wins` }).click();
    await form.getByRole("button", { name: "Save Result" }).click();

    await expect.poll(
      async () => (await db()`select status::text as s from public.matches where id = ${match.id}`)[0].s,
      { message: `match ${pairKey(match)} saved`, timeout: 60_000 }
    ).toBe("completed");
  }
});

test("every grant is exact: match DP + full-round rewards", async () => {
  const after = await snapshotAll(USERNAMES);
  const rules = ACTIVE_RULES;

  for (const username of USERNAMES) {
    const place = EXPECTED_PLACE.indexOf(username);
    const placement = rules.round.placements[place];

    const myMatches = matches.filter((m) => [m.player_one_id, m.player_two_id].includes(ids[username]));
    const matchGrants: ExpectedGrant[] = myMatches.map((m) => ({
      reason: rules.match.reason,
      matchId: m.id,
      amount: WINNER_OF[pairKey(m)] === username ? rules.match.winDp : rules.match.lossDp,
    }));

    const roundGrants: ExpectedGrant[] = [
      {
        reason: rules.round.participation.reason,
        competitionId,
        round: 1,
        amount: rules.round.participation.dp,
      },
      {
        reason: placement.reason,
        competitionId,
        round: 1,
        amount: placement.dp,
      },
    ];

    await expectGrantsExactlyOnce(username, [...matchGrants, ...roundGrants]);

    const expectedDp = expectedRoundDp(username, WINNER_OF, EXPECTED_PLACE);

    expect(await competitionDp(username, competitionId), `${username} DP from this round`).toBe(expectedDp);
    expectLedgerDeltaMatchesBalanceDelta(username, before[username], after[username]);

    // Vouchers from this round: participation + placement.
    const expectedVouchers: Record<string, number> = {};

    for (const [type, n] of [
      ...Object.entries(rules.round.participation.vouchers),
      ...Object.entries(placement.vouchers),
    ]) {
      expectedVouchers[type] = (expectedVouchers[type] ?? 0) + n;
    }

    const roundVouchers = await db()`
      select voucher_type, sum(quantity)::int as n
      from public.reward_vouchers
      where profile_id = ${ids[username]} and source_id = ${competitionId}
      group by 1
    `;

    expect(
      Object.fromEntries(roundVouchers.map((r) => [r.voucher_type, r.n])),
      `${username} vouchers from the round`
    ).toEqual(expectedVouchers);

    await expectNoDuplicateGrants(username);
  }
});

test("nothing is paid twice: resubmit, re-settle, refresh", async ({ page }) => {
  const snap = await snapshotAll(USERNAMES);
  const compDp: Record<string, number> = {};

  for (const username of USERNAMES) {
    compDp[username] = await competitionDp(username, competitionId);
  }

  // 1. Submitting a result again is refused.
  for (const match of matches) {
    const again = await rpcAs(ADMIN, "submit_competition_match_result_v2", {
      target_match_id: match.id,
      target_player_one_duel_wins: 1,
      target_player_two_duel_wins: 0,
    });

    // A finished competition refuses with "not active" (admin guard
    // added 2026-10-12); a still-running one with "already has a result".
    expect(again.error, "second submit is refused").toMatch(/already has a result|not active/i);

    // 2. The older "award DP for my match" RPC (still called by the
    //    practice-match flow) must be a no-op for an already-paid match.
    for (const player of [match.player_one_id, match.player_two_id]) {
      const award = await rpcAs(names[player], "award_match_duel_points", { target_match_id: match.id });

      expect(award.error).toBeNull();
    }
  }

  // 3. Re-running the round settlement (internal; as the DB itself
  //    would on a retry) grants nothing new.
  for (const match of matches) {
    const [row] = await db()`select public.settle_round_rewards_v2(${competitionId}::uuid, ${match.round_number}::int) as created`;

    expect(row.created, "re-settle creates no grants").toBe(0);
  }

  // 4. Refreshing the pages that show rewards.
  await login(page, ADMIN);

  for (const route of [`/competitions/${competitionId}`, "/wallet", "/"]) {
    await page.goto(route);
    await page.reload();
  }

  const after = await snapshotAll(USERNAMES);

  for (const username of USERNAMES) {
    expect(await competitionDp(username, competitionId), `${username} nothing new from this competition`).toBe(compDp[username]);
    expectLedgerDeltaMatchesBalanceDelta(username, snap[username], after[username]);
    await expectNoDuplicateGrants(username);
  }
});

test("the wallet shows each player's round rewards", async ({ page }) => {
  await login(page, "fardin");
  await page.goto("/wallet");

  const body = page.locator("body");

  await expect(body).toContainText(String(ACTIVE_RULES.round.participation.dp));
  await expect(body).toContainText(String(ACTIVE_RULES.round.placements[2].dp));
});

// 2.0 fix (202610120120_round_rewards_resettle_on_correction): a
// corrected result re-settles the round - wrong placement grants are
// reversed with a negative ledger row and the right ones granted. On
// the live app (main) corrections never touched round grants.
test("a corrected result re-settles the round exactly", async () => {
  const corrected: Record<string, Username> = {
    ...WINNER_OF,
    "fardin|samo": "fardin",
  };
  // bossg 2 wins, fardin 1, samo 0.
  const correctedPlaces: Username[] = ["bossg", "fardin", "samo"];
  const match = matches.find((m) => pairKey(m) === "fardin|samo");

  expect(match).toBeTruthy();

  const fardinIsOne = match?.player_one_id === ids.fardin;
  const result = await rpcAs(ADMIN, "correct_competition_match_result_v2", {
    target_match_id: match?.id,
    target_player_one_duel_wins: fardinIsOne ? 1 : 0,
    target_player_two_duel_wins: fardinIsOne ? 0 : 1,
    target_reason: "e2e bot: score was recorded wrong",
  });

  expect(result.error).toBeNull();

  const after = await snapshotAll(USERNAMES);

  for (const username of USERNAMES) {
    expect(
      await competitionDp(username, competitionId),
      `${username} DP from this round after the correction`
    ).toBe(expectedRoundDp(username, corrected, correctedPlaces));
    expectLedgerDeltaMatchesBalanceDelta(username, before[username], after[username]);

    const grants = await db()`
      select reward_role from public.competition_round_reward_grants
      where competition_id = ${competitionId} and profile_id = ${ids[username]} and status = 'granted'
      order by reward_role
    `;
    const placeRole = ["round_winner", "round_runner_up", "round_third"][correctedPlaces.indexOf(username)];

    expect(grants.map((g) => g.reward_role), `${username} active round grants`).toEqual(
      ["participation", placeRole].sort()
    );
  }
});
