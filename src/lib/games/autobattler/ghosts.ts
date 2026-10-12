import {
  createPrng,
} from "../prng";

import {
  MAX_WAVES,
  normalizeGhosts,
  type GhostBoard,
} from "./engine";

// =========================================================
// SHADOW ARENA - async "ghost" PvP vs league-mates.
//
// When a run STARTS, the server action asks the database for
// every league-mate's recorded boards (best validated run per
// friend per turn, current ENGINE_VERSION only), picks one ghost
// per turn with pickGhosts() and freezes that list with the run
// (arena_run_ghosts). The browser gets exactly that list; the
// server replay loads exactly that list again. Turns without a
// ghost fall back to the computer Boss wave.
//
// Pure + deterministic: same seed + same candidates = same ghosts.
// =========================================================

export type GhostCandidate = {
  snapshotId: string;
  profileId: string;
  name: string;
  turn: number;
};

export type GhostAssignment = {
  turn: number;
  snapshotId: string;
};

/**
 * One ghost per turn where any friend has a board for that turn,
 * rotating through friends (a seeded first friend, then the next
 * one each turn, so nobody comes twice in a row if 2+ can play). Candidates must already be one per (friend,
 * turn); if not, the first one in the given order wins.
 */
export function pickGhosts(
  seed: string,
  candidates: readonly GhostCandidate[]
): GhostAssignment[] {
  const byFriendTurn =
    new Map<string, GhostCandidate>();

  for (const candidate of candidates) {
    if (
      !Number.isInteger(candidate.turn) ||
      candidate.turn < 1 ||
      candidate.turn > MAX_WAVES
    ) {
      continue;
    }

    const key =
      `${candidate.profileId}:${candidate.turn}`;

    if (!byFriendTurn.has(key)) {
      byFriendTurn.set(key, candidate);
    }
  }

  const friends =
    [...new Set(
      [...byFriendTurn.values()].map(
        (candidate) => candidate.profileId
      )
    )].sort();

  if (friends.length === 0) {
    return [];
  }

  // Seeded first friend, then always the next friend (in id
  // order) who has a board for that turn.
  let next =
    createPrng(`${seed}:ghosts`).int(0, friends.length - 1);

  const picks: GhostAssignment[] = [];

  for (let turn = 1; turn <= MAX_WAVES; turn++) {
    for (let k = 0; k < friends.length; k++) {
      const index =
        (next + k) % friends.length;

      const candidate =
        byFriendTurn.get(`${friends[index]}:${turn}`);

      if (candidate) {
        picks.push({
          turn,
          snapshotId: candidate.snapshotId,
        });

        next = index + 1;

        break;
      }
    }
  }

  return picks;
}

/**
 * One arena_run_ghosts row (a frozen copy, so it never changes).
 * `board` is {"units": [...]}: an object so later versions can add
 * more (positions, a spell/trap zone) without a schema change.
 */
export type FrozenGhostRow = {
  turn: number;
  snapshot_id: string;
  ghost_name: string;
  board: unknown;
};

/** arena_run_ghosts rows -> the engine's per-turn ghost list. */
export function ghostTableFromRows(
  rows: readonly FrozenGhostRow[] | null | undefined
): (GhostBoard | null)[] {
  const list: unknown[] =
    new Array(MAX_WAVES).fill(null);

  for (const row of rows ?? []) {
    if (
      Number.isInteger(row.turn) &&
      row.turn >= 1 &&
      row.turn <= MAX_WAVES
    ) {
      list[row.turn - 1] = {
        id: row.snapshot_id,
        name: row.ghost_name,
        units:
          typeof row.board === "object" && row.board !== null
            ? (row.board as {
                units?: unknown;
              }).units
            : null,
      };
    }
  }

  return normalizeGhosts(list);
}
