import {
  describe,
  it,
} from "vitest";

import {
  playBotRun,
} from "./bot";

import {
  describeScore,
  resolveCombat,
  runScore,
  turnSeconds,
  MAX_WAVES,
  type GhostBoard,
} from "./engine";

import {
  pickGhosts,
} from "./ghosts";

import {
  createPrng,
} from "../prng";

// Balance report (not a correctness test). Run with:
//   AB_BALANCE=1 npx vitest run src/lib/games/autobattler/balance.test.ts
//
// 1. Boss-only runs (no friends yet): how far the greedy bot gets.
// 2. Ghost runs: every bot fights boards recorded from OTHER bot
//    runs (4 "friends"), picked like the server does.
// Run length = 70% of every turn timer + combat playback
// (~1.5 beats per frame, beat as in arena-combat.tsx) + 3s.

const RUNS = 300;

function playbackSeconds(
  frames: number
) {
  const beat =
    Math.max(
      130,
      Math.min(
        310,
        Math.floor(7500 / Math.max(1, frames))
      )
    );

  return (250 + frames * beat * 1.5) / 1000;
}

function report(
  label: string,
  play: (i: number) => ReturnType<typeof playBotRun>
) {
  const waves: number[] = [];
  const minutes: number[] = [];

  const lossesAt: number[] =
    new Array(MAX_WAVES + 1).fill(0);

  let fusions = 0;
  let xyz = 0;

  for (let i = 0; i < RUNS; i++) {
    const run =
      play(i);

    waves.push(describeScore(runScore(run.state)).survived);

    let seconds = 0;

    for (const wave of run.state.history) {
      if (wave.result === "loss") {
        lossesAt[wave.wave] += 1;
      }

      seconds += turnSeconds(wave.wave) * 0.7 + 3;
    }

    // Re-run the fights with frames to time the playback.
    for (const snapshot of run.state.snapshots) {
      const frames =
        resolveCombat(
          snapshot.units.map(
            (unit, index) => ({
              ...unit,
              uid: index + 1,
            })
          ),
          {
            kind: "boss",
            wave: snapshot.turn,
            route: "x",
            routeName: "x",
            tier: 1,
            units: [],
          },
          createPrng("t"),
          true
        ).frames.length;

      seconds += playbackSeconds(Math.max(frames, 12));
    }

    minutes.push(seconds / 60);

    fusions += run.state.log.filter((action) => action.startsWith("c")).length;
    xyz += run.state.log.filter((action) => action.startsWith("x")).length;
  }

  waves.sort((a, b) => a - b);
  minutes.sort((a, b) => a - b);

  const average =
    waves.reduce((sum, wave) => sum + wave, 0) / waves.length;

  console.log(
    label,
    "avg", average.toFixed(2),
    "p10", waves[Math.floor(RUNS * 0.1)],
    "median", waves[Math.floor(RUNS / 2)],
    "p90", waves[Math.floor(RUNS * 0.9)],
    "victories", waves.filter((wave) => wave >= MAX_WAVES).length,
    "| minutes median", minutes[Math.floor(RUNS / 2)].toFixed(1),
    "max", minutes[RUNS - 1].toFixed(1),
    "| fusions/run", (fusions / RUNS).toFixed(2),
    "xyz/run", (xyz / RUNS).toFixed(2)
  );

  console.log("  losses by wave", lossesAt.slice(1).join(" "));
}

describe.skipIf(!process.env.AB_BALANCE)("balance report", () => {
  it("prints how far the greedy bot gets", () => {
    for (const smart of [false, true]) {
      report(
        smart ? "bosses smart" : "bosses plain",
        (i) =>
          playBotRun(
            `balance-${i}`,
            {
              smart,
            }
          )
      );
    }

    // Friends' boards from earlier bot runs.
    const friends =
      Array.from(
        {
          length: 4,
        },
        (_, f) =>
          playBotRun(
            `friend-${f}`,
            {
              smart: true,
            }
          )
      );

    const boards =
      new Map<string, GhostBoard>();

    const candidates =
      friends.flatMap(
        (run, f) =>
          run.state.snapshots.map(
            (snapshot) => {
              const id =
                `friend-${f}-${snapshot.turn}`;

              boards.set(id, {
                id,
                name: `Friend ${f}`,
                units: snapshot.units,
              });

              return {
                snapshotId: id,
                profileId: `friend-${f}`,
                name: `Friend ${f}`,
                turn: snapshot.turn,
              };
            }
          )
      );

    report(
      "ghosts smart",
      (i) => {
        const ghosts: (GhostBoard | null)[] =
          new Array(MAX_WAVES).fill(null);

        for (const pick of pickGhosts(`ghost-${i}`, candidates)) {
          ghosts[pick.turn - 1] = boards.get(pick.snapshotId) ?? null;
        }

        return playBotRun(
          `ghost-${i}`,
          {
            smart: true,
            ghosts,
          }
        );
      }
    );
  });
});
