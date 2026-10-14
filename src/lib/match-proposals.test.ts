import {
  describe,
  expect,
  it,
} from "vitest";

import {
  describeProposal,
  proposalHref,
  type OpenProposal,
} from "./match-proposals";

import {
  computeAttentionItems,
} from "./attention-items";

const names = new Map([
  ["p1", "Bossg"],
  ["p2", "Samo"],
]);

const nameOf = (id: string) => names.get(id) ?? "Duelist";

function proposal(
  overrides: Partial<OpenProposal>
): OpenProposal {
  return {
    id: "x",
    match_id: "m1",
    competition_id: "c1",
    kind: "competition_correction",
    proposed_by: "p1",
    respond_by: "p2",
    player_one_duel_wins: 0,
    player_two_duel_wins: 1,
    proposed_result: null,
    reason: null,
    created_at: "2026-10-15T00:00:00Z",
    match: {
      player_one_id: "p1",
      player_two_id: "p2",
      match_format: "single_duel",
    },
    ...overrides,
  };
}

describe("describeProposal", () => {
  it("names the winner of a single duel", () => {
    expect(describeProposal(proposal({}), nameOf)).toBe("Samo won");
  });

  it("adds the score for best of 3", () => {
    expect(
      describeProposal(
        proposal({
          player_one_duel_wins: 2,
          player_two_duel_wins: 1,
          match: {
            player_one_id: "p1",
            player_two_id: "p2",
            match_format: "best_of_3",
          },
        }),
        nameOf
      )
    ).toBe("Bossg won 2-1");
  });

  it("handles a practice draw", () => {
    expect(
      describeProposal(
        proposal({
          kind: "practice_resolution",
          proposed_result: "draw",
        }),
        nameOf
      )
    ).toBe("a draw");
  });

  it("links a season duel to its round screen, a practice duel to the duel", () => {
    expect(proposalHref({ competition_id: "c1", match_id: "m1" })).toBe("/competitions/c1/round");
    expect(proposalHref({ competition_id: null, match_id: "m1" })).toBe("/matches/m1");
  });
});

describe("computeAttentionItems", () => {
  it("names the opponent who sent a result", () => {
    const items = computeAttentionItems(
      [
        {
          id: "m1",
          status: "result_submitted",
          player_one_id: "p1",
          player_two_id: "p2",
          result_submitted_by: "p1",
          competition_id: "c1",
        },
      ],
      [],
      "p2",
      names
    );

    expect(items[0].hint).toBe("Bossg sent a result - confirm or dispute it.");
  });
});
