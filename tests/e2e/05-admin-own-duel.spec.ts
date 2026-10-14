import {
  expect,
  test,
} from "@playwright/test";

import { rpcAs } from "./helpers/api";
import { login } from "./helpers/auth";
import {
  closeDb,
  db,
  leagueIdOf,
  profileId,
} from "./helpers/db";
import { ensureOnboarded } from "./helpers/seed";
import {
  ADMIN,
  USERNAMES,
  type Username,
} from "./helpers/users";

// Owner decisions B + C (QA fix round, 2026-10-15):
//  B. an admin who corrects a duel they PLAY in only proposes it; the
//     opponent accepts it on the round screen (also listed under
//     "Waiting on you"), and only then does the result change.
//  C. the winner of a finalized season gets a "Season N Champion"
//     title + badge on their profile.

test.describe.configure({ mode: "serial" });

const ids: Record<string, string> = {};

type MatchRow = {
  id: string;
  player_one_id: string;
  player_two_id: string;
};

let competitionId = "";
let matches: MatchRow[] = [];

function between(a: Username, b: Username) {
  const match = matches.find(
    (m) =>
      [m.player_one_id, m.player_two_id].includes(ids[a]) &&
      [m.player_one_id, m.player_two_id].includes(ids[b])
  );

  if (!match) {
    throw new Error(`no duel ${a} vs ${b}`);
  }

  return match;
}

// `winner` beats `loser` 1-0: the admin referees a duel they don't
// play in; otherwise one player sends it and the other confirms.
async function play(winner: Username, loser: Username) {
  const match = between(winner, loser);
  const args = {
    target_match_id: match.id,
    target_player_one_duel_wins: match.player_one_id === ids[winner] ? 1 : 0,
    target_player_two_duel_wins: match.player_two_id === ids[winner] ? 1 : 0,
  };
  const sender: Username = winner === ADMIN || loser === ADMIN ? winner : ADMIN;
  const sent = await rpcAs(sender, "submit_competition_match_result_v2", args);

  expect(sent.error, `${winner} beats ${loser} sent`).toBeNull();

  if (sender !== ADMIN || winner === ADMIN) {
    const confirmed = await rpcAs(loser, "confirm_competition_match_result", {
      target_match_id: match.id,
    });

    expect(confirmed.error, `${loser} confirms`).toBeNull();
  }
}

async function newCompetition(season: boolean) {
  const leagueId = await leagueIdOf(ADMIN);

  if (season) {
    // Test database only: any other open season steps aside.
    await db()`
      update public.competitions
      set is_season = false
      where league_id = ${leagueId} and is_season and status in ('draft', 'active')
    `;
  }

  const created = await rpcAs<string>(ADMIN, "create_competition_v2", {
    target_league_id: leagueId,
    target_name: `${season ? "Bot season" : "Bot event"} ${new Date().toISOString()}`,
    target_meetings_per_pairing: 1,
    target_match_format: "single_duel",
  });

  expect(created.error).toBeNull();
  competitionId = String(created.data);

  if (season) {
    const marked = await rpcAs(ADMIN, "mark_competition_as_season", {
      target_competition_id: competitionId,
    });

    expect(marked.error).toBeNull();
  }

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
    select id, player_one_id, player_two_id
    from public.matches
    where competition_id = ${competitionId}
  `) as unknown as MatchRow[];
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureOnboarded(USERNAMES);

  for (const username of USERNAMES) {
    ids[username] = await profileId(username);
  }
});

test.afterAll(async () => {
  await closeDb();
});

test("B: the admin's correction of their own duel waits for the opponent", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  await newCompetition(false);
  await play(ADMIN, "samo");

  const duel = between(ADMIN, "samo");

  // --- bossg proposes "samo won" on the competition page ---
  const adminContext = await browser.newContext({
    ...testInfo.project.use,
    storageState: {
      cookies: [],
      origins: [],
    },
  });
  const adminPage = await adminContext.newPage();

  await login(adminPage, ADMIN);
  await adminPage.goto(`/competitions/${competitionId}`);

  const matchCard = adminPage.getByTestId(`match-card-${duel.id}`);
  const proposeButton = matchCard.getByRole("button", { name: "Propose a correction" });

  await proposeButton.scrollIntoViewIfNeeded();
  await proposeButton.click();
  await matchCard.getByRole("button", { name: "samo wins" }).click();
  await matchCard.locator('input[name="reason"]').fill("e2e bot: samo actually won");
  await matchCard.getByRole("button", { name: "Send to samo" }).click();

  await expect(matchCard.getByText(/Proposal sent/)).toBeVisible();

  await adminPage.screenshot({
    path: testInfo.outputPath("b-1-admin-proposed.png"),
    fullPage: true,
  });

  const [pending] = await db()`
    select id, status from public.match_result_proposals
    where match_id = ${duel.id} and status = 'pending'
  `;

  expect(pending, "a pending proposal").toBeTruthy();

  const [unchanged] = await db()`select winner_id from public.matches where id = ${duel.id}`;

  expect(unchanged.winner_id, "result unchanged until samo accepts").toBe(ids[ADMIN]);

  await adminContext.close();

  // --- samo sees it under Waiting on you and accepts it ---
  const samoContext = await browser.newContext({
    ...testInfo.project.use,
    storageState: {
      cookies: [],
      origins: [],
    },
  });
  const samoPage = await samoContext.newPage();

  await login(samoPage, "samo");
  await samoPage.goto("/attention");
  await expect(samoPage.getByText("Result correction to accept")).toBeVisible();
  await samoPage.getByText("Result correction to accept").click();
  await expect(samoPage).toHaveURL(new RegExp(`/competitions/${competitionId}/round`));

  const proposal = samoPage.getByTestId("match-proposal").first();

  await expect(proposal).toContainText("wants to change your duel: samo won");
  await samoPage.screenshot({
    path: testInfo.outputPath("b-2-opponent-sees-proposal.png"),
    fullPage: true,
  });

  await proposal.getByRole("button", { name: "Accept" }).click();
  await expect(samoPage.getByText("Accepted — the result is updated.")).toBeVisible();

  await samoPage.screenshot({
    path: testInfo.outputPath("b-3-accepted.png"),
    fullPage: true,
  });

  const [corrected] = await db()`select winner_id from public.matches where id = ${duel.id}`;

  expect(corrected.winner_id, "accepted: samo is the winner now").toBe(ids.samo);

  const [answered] = await db()`select status from public.match_result_proposals where id = ${pending.id}`;

  expect(answered.status).toBe("accepted");

  await samoContext.close();
});

test("C: the season champion gets a title and a badge", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await newCompetition(true);

  // samo 2 wins, bossg 1, fardin 0; the admin-refereed duel goes
  // last so the automatic finalize runs as the admin.
  await play("samo", ADMIN);
  await play(ADMIN, "fardin");
  await play("samo", "fardin");

  const [competition] = await db()`select status from public.competitions where id = ${competitionId}`;

  expect(competition.status, "the season finalized itself").toBe("completed");

  const [title] = await db()`
    select title from public.profile_titles
    where profile_id = ${ids.samo} and source = 'season_champion'
  `;

  expect(title?.title ?? "").toMatch(/^Season \d+ Champion$/);

  // The suite runs once per project: start unequipped every time.
  await db()`update public.profiles set custom_title = null where id = ${ids.samo}`;

  await login(page, "samo");
  await page.goto("/profile");
  await expect(page.getByTestId("champion-badge").first()).toBeVisible();
  await expect(page.getByTestId("earned-title").filter({ hasText: title.title })).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("c-1-profile-champion.png"),
    fullPage: false,
  });

  // Equip it like any earned title.
  const titleCard = page.getByTestId("earned-title-card").filter({ hasText: title.title });

  await titleCard.getByRole("button", { name: "Equip Title", exact: true }).click();
  await expect(page.getByText("Title equipped.")).toBeVisible();

  const [profile] = await db()`select custom_title from public.profiles where id = ${ids.samo}`;

  expect(profile.custom_title).toBe(title.title);

  await page.goto("/league");
  await expect(page.getByTestId("champion-badge").first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("c-2-league-badge.png"),
    fullPage: false,
  });
});
