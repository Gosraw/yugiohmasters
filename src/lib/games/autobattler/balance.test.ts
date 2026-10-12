import {
  describe,
  it,
} from "vitest";

import {
  playBotRun,
} from "./bot";

import {
  describeScore,
  runScore,
} from "./engine";

// Balance report (not a correctness test). Run with:
//   AB_BALANCE=1 npx vitest run src/lib/games/autobattler/balance.test.ts
describe.skipIf(!process.env.AB_BALANCE)("balance report", () => {
  it("prints how far the greedy bot gets", () => {
    for (const smart of [false, true]) {
      const waves: number[] = [];

      const lossesAt: number[] =
        new Array(21).fill(0);

      for (let i = 0; i < 300; i++) {
        const run =
          playBotRun(
            `balance-${i}`,
            {
              smart,
            }
          );

        waves.push(describeScore(runScore(run.state)).survived);

        for (const wave of run.state.history) {
          if (wave.result === "loss") {
            lossesAt[wave.wave] += 1;
          }
        }
      }

      waves.sort((a, b) => a - b);

      const average =
        waves.reduce((sum, wave) => sum + wave, 0) / waves.length;

      console.log(
        smart ? "smart" : "plain",
        "avg", average.toFixed(2),
        "p10", waves[30],
        "median", waves[150],
        "p90", waves[270],
        "max", waves[299],
        "victories", waves.filter((wave) => wave >= 20).length
      );

      console.log("losses by wave", lossesAt.slice(1).join(" "));
    }
  });
});
