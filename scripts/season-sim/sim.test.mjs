// Run: node scripts/season-sim/sim.test.mjs
import assert from "node:assert/strict";
import { CONFIGS, PROPOSED, SCENARIOS } from "./config.mjs";
import { simulateSeason, runMany, summarize, nextBossCost, BOSS_MAX, deriveSeed, createRng } from "./sim.mjs";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test("RNG is deterministic per seed", () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  assert.notEqual(createRng(1).next(), createRng(2).next());
  assert.notEqual(deriveSeed(1, 0), deriveSeed(1, 1));
});

test("same config + scenario + seed gives an identical season", () => {
  for (const config of Object.values(CONFIGS)) {
    const r1 = simulateSeason({ config, scenario: SCENARIOS.baseline, seed: 2024 });
    const r2 = simulateSeason({ config, scenario: SCENARIOS.baseline, seed: 2024 });
    assert.deepEqual(r1, r2);
    const r3 = simulateSeason({ config, scenario: SCENARIOS.baseline, seed: 2025 });
    assert.notDeepEqual(r1, r3);
  }
});

test("runMany + summarize are deterministic", () => {
  const s1 = summarize(runMany({ config: PROPOSED, scenarioKey: "top", runs: 40, seed: 9 }));
  const s2 = summarize(runMany({ config: PROPOSED, scenarioKey: "top", runs: 40, seed: 9 }));
  assert.deepEqual(s1, s2);
});

test("accounting: DP in - DP out = balance = envelopes, never negative (all configs x scenarios)", () => {
  for (const config of Object.values(CONFIGS)) {
    for (const [key, scenario] of Object.entries(SCENARIOS)) {
      for (let i = 0; i < 15; i++) {
        const r = simulateSeason({ config, scenario, seed: deriveSeed(77, i) });
        let leagueLegendaries = 0;
        for (const p of r.players) {
          const dpIn = sum(p.ledgerIn);
          const dpOut = sum(p.ledgerOut);
          assert.equal(dpIn - dpOut, p.balance, `${config.name}/${key}/${p.id} ledger mismatch`);
          assert.equal(p.funds.pack + p.funds.singles + p.funds.boss, p.balance, `${config.name}/${key}/${p.id} envelopes`);
          for (const v of Object.values(p.funds)) assert.ok(v >= 0);
          assert.ok(Number.isInteger(p.balance));
          // weekly snapshots agree with the ledger at season end
          const last = p.weekly[p.weekly.length - 1];
          assert.equal(last.dpEarned, dpIn);
          assert.equal(last.dpSpent, dpOut);
          assert.equal(last.balance, p.balance);
          // cumulative weekly series never go down
          for (let w = 1; w < p.weekly.length; w++) {
            assert.ok(p.weekly[w].dpEarned >= p.weekly[w - 1].dpEarned);
            assert.ok(p.weekly[w].bossIndex >= p.weekly[w - 1].bossIndex);
          }
          // Boss spend equals the price list of every step taken
          let bossCost = 0;
          for (let idx = 1; idx < p.bossIndex; idx++) bossCost += nextBossCost(config, idx);
          assert.equal((p.ledgerOut.bossStage ?? 0) + (p.ledgerOut.bossSlot ?? 0), bossCost);
          assert.ok(p.bossIndex >= 1 && p.bossIndex <= BOSS_MAX);
          // packs opened = bought + vouchers
          assert.equal(p.packsOpened, p.packsBought + p.vouchersOpened);
          leagueLegendaries += p.legendaries;
        }
        assert.equal(leagueLegendaries, r.league.legendariesPulled);
        assert.ok(r.league.legendariesPulled <= config.legendaryPool);
        assert.equal(r.league.poolLeft, config.legendaryPool - r.league.legendariesPulled);
      }
    }
  }
});

test("match + round DP matches the rule book (current config)", () => {
  const config = CONFIGS.current;
  const r = simulateSeason({ config, scenario: SCENARIOS.baseline, seed: 5 });
  const rounds = config.season.weeks * config.season.roundsPerWeek;
  const matchDpTotal = r.players.reduce((a, p) => a + p.ledgerIn.match, 0);
  // each round: 3 matches, each pays win + loss
  assert.equal(matchDpTotal, rounds * 3 * (config.match.winDp + config.match.lossDp));
  for (const p of r.players) {
    assert.equal(p.ledgerIn.roundParticipation, rounds * config.round.participationDp);
    assert.equal(p.seasonWins + p.seasonLosses, rounds * 2);
  }
  const placementTotal = r.players.reduce((a, p) => a + p.ledgerIn.roundPlacement, 0);
  assert.equal(placementTotal, rounds * config.round.placementDp.reduce((a, b) => a + b, 0));
});

test("Boss price ladder: stage 1 free, slots unlock a route at stage 1", () => {
  const c = PROPOSED;
  const ladder = [];
  for (let i = 1; i < BOSS_MAX; i++) ladder.push(nextBossCost(c, i));
  const [s2, s3, s4] = c.boss.stageCosts;
  assert.deepEqual(ladder, [s2, s3, s4, c.boss.slotCosts[1], s2, s3, s4, c.boss.slotCosts[2], s2, s3, s4]);
  assert.equal(nextBossCost(c, BOSS_MAX), null);
});

test("Legendary pool can never be over-drawn and pity guarantees fire", () => {
  const tiny = { ...PROPOSED, legendaryPool: 1, luckThreshold: 3 };
  for (let i = 0; i < 10; i++) {
    const r = simulateSeason({ config: tiny, scenario: SCENARIOS.baseline, seed: deriveSeed(3, i) });
    assert.ok(r.league.legendariesPulled <= 1);
    assert.ok(r.league.poolExhaustedHits > 0);
    assert.ok(r.players.some((p) => p.guaranteedLegendaries > 0));
  }
});

test("Season Path pays each tier once and never past the last tier", () => {
  const r = simulateSeason({ config: PROPOSED, scenario: SCENARIOS.perksHigh, seed: 11 });
  const sp = PROPOSED.seasonPath;
  for (const p of r.players) {
    assert.ok(p.pathTier <= sp.tiers.length);
    assert.equal(p.pathTier, Math.min(sp.tiers.length, Math.floor(p.xp / sp.xpPerTier)));
    const expectDp = sp.tiers.slice(0, p.pathTier).reduce((a, t) => a + (t.dp ?? 0), 0);
    assert.equal(p.ledgerIn.seasonPath ?? 0, expectDp);
  }
});

test("perk weekly cap is respected", () => {
  const capped = { ...PROPOSED, perks: { ...PROPOSED.perks, weeklyCapDp: 200 } };
  const r = simulateSeason({ config: capped, scenario: SCENARIOS.maxPerks, seed: 4 });
  for (const p of r.players) assert.ok((p.ledgerIn.perks ?? 0) <= 200 * capped.season.weeks);
});

console.log(`\n${passed} tests passed`);
