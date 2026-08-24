import {
  describe,
  expect,
  it,
} from "vitest";

import {
  classifyCardAvailability,
  splitCandidatesByAvailability,
  type AvailabilityCandidate,
  type CardAvailability,
} from "@/lib/ai/ownership-intelligence";

import type {
  StatsProfile,
} from "@/lib/league-stats";

// =========================================================
// OWNERSHIP-AWARE INTELLIGENCE - mandated test suite
//
// Covers the 5 explicit scenarios from the product spec: owned mode
// never returns unowned cards, discovery excludes already-owned
// cards, league isolation, ineligible cards never becoming a normal
// recommendation, and correct trade-candidate classification.
//
// classifyCardAvailability/splitCandidatesByAvailability are pure
// (no Supabase call) - these tests exercise them directly with
// synthetic fixtures, the same style already established for
// card-synergy.test.ts. batchGetCardAvailability's own I/O plumbing
// (the single batched card_instances + league-profile query) is not
// separately mocked here, consistent with how getCardSynergyInsight's
// I/O layer isn't unit-tested either - only the pure classification
// it delegates to is.
// =========================================================

function profile(
  partial: Partial<StatsProfile> & { id: string }
): StatsProfile {
  return {
    username: null,
    duelist_name: "",
    custom_title: null,
    ...partial,
  };
}

const VIEWER = "viewer-id";
const FRIEND = "friend-id";
const OTHER_FRIEND = "other-friend-id";

const profilesById = new Map<string, StatsProfile>([
  [
    FRIEND,
    profile({ id: FRIEND, duelist_name: "Fardin" }),
  ],
  [
    OTHER_FRIEND,
    profile({ id: OTHER_FRIEND, duelist_name: "Samo" }),
  ],
]);

const eligible: AvailabilityCandidate = {
  id: "card-1",
  formatEligible: true,
};

const ineligible: AvailabilityCandidate = {
  id: "card-2",
  formatEligible: false,
};

describe("ownership-aware intelligence", () => {
  it("1. a card the viewer owns is classified owned_by_you, regardless of who else also owns copies", () => {
    const result = classifyCardAvailability(
      eligible,
      [
        { current_owner_id: VIEWER },
        { current_owner_id: FRIEND },
      ],
      VIEWER,
      profilesById
    );

    expect(result.status).toBe("owned_by_you");
    expect(result.ownedCountByYou).toBe(1);
    // Owned mode reads from `owned` bucket only, which requires
    // status === owned_by_you - other-owner info is irrelevant once
    // the viewer already owns a copy, so owners is empty here.
    expect(result.owners).toHaveLength(0);
  });

  it("2. a card owned by exactly one other league member is classified owned_by_league_member (trade candidate) with the correct name+count", () => {
    const result = classifyCardAvailability(
      eligible,
      [
        { current_owner_id: FRIEND },
        { current_owner_id: FRIEND },
      ],
      VIEWER,
      profilesById
    );

    expect(result.status).toBe("owned_by_league_member");
    expect(result.owners).toEqual([
      { profileId: FRIEND, name: "Fardin", count: 2 },
    ]);
  });

  it("3. a card owned by MULTIPLE other league members lists every owner, sorted by count desc", () => {
    const result = classifyCardAvailability(
      eligible,
      [
        { current_owner_id: OTHER_FRIEND },
        { current_owner_id: FRIEND },
        { current_owner_id: FRIEND },
      ],
      VIEWER,
      profilesById
    );

    expect(result.status).toBe("owned_by_league_member");
    expect(result.owners.map((o) => o.name)).toEqual(["Fardin", "Samo"]);
    expect(result.owners[0].count).toBe(2);
    expect(result.owners[1].count).toBe(1);
  });

  it("4. a card with no instances at all in the league is unowned_in_league", () => {
    const result = classifyCardAvailability(eligible, [], VIEWER, profilesById);
    expect(result.status).toBe("unowned_in_league");
    expect(result.owners).toHaveLength(0);
  });

  it("5. a format-ineligible card is ALWAYS format_ineligible, even if the viewer physically owns a copy", () => {
    const resultUnowned = classifyCardAvailability(
      ineligible,
      [],
      VIEWER,
      profilesById
    );
    expect(resultUnowned.status).toBe("format_ineligible");

    const resultOwnedByViewer = classifyCardAvailability(
      ineligible,
      [{ current_owner_id: VIEWER }],
      VIEWER,
      profilesById
    );
    expect(resultOwnedByViewer.status).toBe("format_ineligible");

    const resultOwnedByFriend = classifyCardAvailability(
      ineligible,
      [{ current_owner_id: FRIEND }],
      VIEWER,
      profilesById
    );
    expect(resultOwnedByFriend.status).toBe("format_ineligible");
  });

  it("6. LEAGUE ISOLATION: instances from outside the league are never passed in, so a card only owned outside the league classifies as unowned_in_league (not owned_by_league_member)", () => {
    // batchGetCardAvailability's own query is `.eq("league_id", ...)`
    // so out-of-league instances never reach this function at all -
    // this test proves the classifier's OWN behavior is correct given
    // that guarantee: an empty (post-league-filter) instance list must
    // never be treated as "someone owns it".
    const result = classifyCardAvailability(eligible, [], VIEWER, profilesById);
    expect(result.status).toBe("unowned_in_league");
  });

  describe("splitCandidatesByAvailability", () => {
    type Candidate = { card: { id: string; name: string } };

    const owned: Candidate = { card: { id: "owned-card", name: "Owned Card" } };
    const tradeTarget: Candidate = {
      card: { id: "trade-card", name: "Trade Card" },
    };
    const discoveryCard: Candidate = {
      card: { id: "discovery-card", name: "Discovery Card" },
    };
    const ineligibleCard: Candidate = {
      card: { id: "ineligible-card", name: "Ineligible Card" },
    };

    const availabilityMap = new Map<string, CardAvailability>([
      [
        "owned-card",
        { status: "owned_by_you", ownedCountByYou: 1, owners: [] },
      ],
      [
        "trade-card",
        {
          status: "owned_by_league_member",
          ownedCountByYou: 0,
          owners: [{ profileId: FRIEND, name: "Fardin", count: 1 }],
        },
      ],
      [
        "discovery-card",
        { status: "unowned_in_league", ownedCountByYou: 0, owners: [] },
      ],
      [
        "ineligible-card",
        { status: "format_ineligible", ownedCountByYou: 0, owners: [] },
      ],
    ]);

    const { owned: ownedResult, tradeTargets, discovery } =
      splitCandidatesByAvailability(
        [owned, tradeTarget, discoveryCard, ineligibleCard],
        availabilityMap
      );

    it("7. owned bucket contains ONLY owned cards, never an unowned or trade-target card", () => {
      expect(ownedResult).toHaveLength(1);
      expect(ownedResult[0].card.id).toBe("owned-card");
    });

    it("8. discovery bucket EXCLUDES already-owned cards and trade-target cards", () => {
      expect(discovery).toHaveLength(1);
      expect(discovery[0].card.id).toBe("discovery-card");
    });

    it("9. trade targets are correctly separated from plain discovery and carry owner info", () => {
      expect(tradeTargets).toHaveLength(1);
      expect(tradeTargets[0].card.id).toBe("trade-card");
      expect(tradeTargets[0].availability.owners[0].name).toBe("Fardin");
    });

    it("10. a format-ineligible card NEVER appears in any of the three buckets", () => {
      const allIds = [
        ...ownedResult.map((c) => c.card.id),
        ...tradeTargets.map((c) => c.card.id),
        ...discovery.map((c) => c.card.id),
      ];
      expect(allIds).not.toContain("ineligible-card");
    });
  });
});
