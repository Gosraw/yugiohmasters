import { describe, expect, it } from "vitest";
import {
  buildMasterDuelChecklist,
  buildYdkExport,
  type MasterDuelExportCardInput,
} from "./master-duel-export";
import { getMasterDuelStatusMeta } from "./master-duel";

function card(
  overrides: Partial<MasterDuelExportCardInput>
): MasterDuelExportCardInput {
  return {
    cardCatalogId: "cat-1",
    name: "Test Card",
    externalCardId: 12345678,
    masterDuelCardId: null,
    masterDuelStatus: "unlimited",
    section: "main",
    ...overrides,
  };
}

describe("buildYdkExport", () => {
  it("puts main and extra deck cards in their own sections, one line per copy", () => {
    const result = buildYdkExport([
      card({ cardCatalogId: "a", externalCardId: 111, section: "main" }),
      card({ cardCatalogId: "a", externalCardId: 111, section: "main" }),
      card({ cardCatalogId: "b", externalCardId: 222, section: "extra" }),
    ]);

    expect(result.ydkText).toContain("#main\n111\n111\n#extra\n222");
    expect(result.mainCount).toBe(2);
    expect(result.extraCount).toBe(1);
    expect(result.missingPasscodeCards).toEqual([]);
  });

  it("prefers masterDuelCardId over externalCardId when both are set", () => {
    const result = buildYdkExport([
      card({
        cardCatalogId: "a",
        externalCardId: 111,
        masterDuelCardId: 999,
        section: "main",
      }),
    ]);
    expect(result.ydkText).toContain("999");
    expect(result.ydkText).not.toContain("111");
  });

  it("never fuzzy-fills a missing passcode - reports it instead", () => {
    const result = buildYdkExport([
      card({
        cardCatalogId: "no-id",
        name: "Mystery Card",
        externalCardId: null,
        masterDuelCardId: null,
      }),
    ]);
    expect(result.mainCount).toBe(0);
    expect(result.missingPasscodeCards).toEqual([
      { cardCatalogId: "no-id", name: "Mystery Card" },
    ]);
  });

  it("still emits bare section headers when a section is empty", () => {
    const result = buildYdkExport([]);
    expect(result.ydkText).toContain("#main");
    expect(result.ydkText).toContain("#extra");
    expect(result.ydkText).toContain("!side");
  });
});

describe("buildMasterDuelChecklist", () => {
  it("groups duplicate copies into one counted line per section", () => {
    const result = buildMasterDuelChecklist(
      [
        card({ cardCatalogId: "a", name: "Ash Blossom", section: "main" }),
        card({ cardCatalogId: "a", name: "Ash Blossom", section: "main" }),
        card({
          cardCatalogId: "b",
          name: "Accesscode Talker",
          section: "extra",
          masterDuelStatus: "limited",
        }),
      ],
      (status) => getMasterDuelStatusMeta(status).shortLabel
    );

    expect(result.lines).toEqual([
      {
        name: "Ash Blossom",
        count: 2,
        section: "main",
        masterDuelStatusLabel: "Legal",
      },
      {
        name: "Accesscode Talker",
        count: 1,
        section: "extra",
        masterDuelStatusLabel: "Limited 1",
      },
    ]);
    expect(result.checklistText).toContain("2x Ash Blossom (Legal)");
    expect(result.checklistText).toContain(
      "1x Accesscode Talker (Limited 1)"
    );
  });
});
