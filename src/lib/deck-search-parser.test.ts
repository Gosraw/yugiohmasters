import { describe, expect, it } from "vitest";

import {
  emptyFilters,
  matchesDeckFilters,
  parseDeckSearch,
  removeChipFromQuery,
  type FilterableCard,
} from "./deck-search-parser";

function card(overrides: Partial<FilterableCard>): FilterableCard {
  return {
    card_type: "Effect Monster",
    monster_type: "Warrior / Effect",
    race: "Warrior",
    attribute: "DARK",
    level: 4,
    rank: null,
    atk: 1800,
    def: 1200,
    ...overrides,
  };
}

describe("parseDeckSearch", () => {
  it("turns 'dark warrior level 4' into three chips and no free text", () => {
    const parsed = parseDeckSearch("dark warrior level 4");

    expect(parsed.filters.attributes).toEqual(["DARK"]);
    expect(parsed.filters.races).toEqual(["Warrior"]);
    expect(parsed.filters.level).toEqual({ min: 4, max: 4 });
    expect(parsed.chips.map((chip) => chip.label)).toEqual(["DARK", "Warrior", "Level 4"]);
    expect(parsed.terms).toEqual([]);
  });

  it("keeps unrecognised words as free text, in order", () => {
    const parsed = parseDeckSearch("Destroy LIGHT monster card");

    expect(parsed.filters.attributes).toEqual(["LIGHT"]);
    expect(parsed.filters.cardTypes).toEqual(["monster"]);
    expect(parsed.terms).toEqual(["destroy", "card"]);
  });

  it("recognises every attribute, case-insensitively", () => {
    const parsed = parseDeckSearch("Dark LIGHT earth Water fire wind divine");

    expect(parsed.filters.attributes).toEqual([
      "DARK",
      "LIGHT",
      "EARTH",
      "WATER",
      "FIRE",
      "WIND",
      "DIVINE",
    ]);
  });

  it("recognises multi-word monster types", () => {
    expect(parseDeckSearch("winged beast").filters.races).toEqual(["Winged Beast"]);
    expect(parseDeckSearch("Sea Serpent").filters.races).toEqual(["Sea Serpent"]);
    expect(parseDeckSearch("beast-warrior").filters.races).toEqual(["Beast-Warrior"]);
    expect(parseDeckSearch("beast warrior").filters.races).toEqual(["Beast-Warrior"]);
    expect(parseDeckSearch("divine beast").filters.races).toEqual(["Divine-Beast"]);
    expect(parseDeckSearch("creator god").filters.races).toEqual(["Creator God"]);
  });

  it("prefers the longest monster type match ('winged beast' is not Beast)", () => {
    const parsed = parseDeckSearch("wind winged beast");

    expect(parsed.filters.races).toEqual(["Winged Beast"]);
    expect(parsed.terms).toEqual([]);
  });

  it("understands plural monster types", () => {
    expect(parseDeckSearch("dragons").filters.races).toEqual(["Dragon"]);
    expect(parseDeckSearch("fairies").filters.races).toEqual(["Fairy"]);
    expect(parseDeckSearch("spellcasters").filters.races).toEqual(["Spellcaster"]);
  });

  it("parses level and rank in several spellings", () => {
    expect(parseDeckSearch("level 4").filters.level).toEqual({ min: 4, max: 4 });
    expect(parseDeckSearch("lv4").filters.level).toEqual({ min: 4, max: 4 });
    expect(parseDeckSearch("lvl 7+").filters.level).toEqual({ min: 7, max: null });
    expect(parseDeckSearch("level 3-6").filters.level).toEqual({ min: 3, max: 6 });
    expect(parseDeckSearch("level <= 4").filters.level).toEqual({ min: null, max: 4 });
    expect(parseDeckSearch("4 star").filters.level).toEqual({ min: 4, max: 4 });
    expect(parseDeckSearch("8-star").filters.level).toEqual({ min: 8, max: 8 });
    expect(parseDeckSearch("rank 4").filters.rank).toEqual({ min: 4, max: 4 });
    expect(parseDeckSearch("rank4").filters.rank).toEqual({ min: 4, max: 4 });
  });

  it("parses ATK/DEF comparisons", () => {
    expect(parseDeckSearch("atk>=2000").filters.atk).toEqual({ min: 2000, max: null });
    expect(parseDeckSearch("atk >= 2000").filters.atk).toEqual({ min: 2000, max: null });
    expect(parseDeckSearch("atk 2000+").filters.atk).toEqual({ min: 2000, max: null });
    expect(parseDeckSearch("atk>2000").filters.atk).toEqual({ min: 2001, max: null });
    expect(parseDeckSearch("atk 2500").filters.atk).toEqual({ min: 2500, max: 2500 });
    expect(parseDeckSearch("def<1000").filters.def).toEqual({ min: null, max: 999 });
    expect(parseDeckSearch("def 1000-2000").filters.def).toEqual({ min: 1000, max: 2000 });
    expect(parseDeckSearch("atk 2000+").chips[0].label).toBe("ATK 2000+");
  });

  it("does not treat a bare stat word without a number as a filter", () => {
    const parsed = parseDeckSearch("level up");

    expect(parsed.filters.level).toEqual({ min: null, max: null });
    expect(parsed.terms).toEqual(["level", "up"]);
  });

  it("recognises monster card kinds", () => {
    const parsed = parseDeckSearch("fusion xyz ritual tuner flip normal");

    expect(parsed.filters.kinds).toEqual(["fusion", "xyz", "ritual", "tuner", "flip", "normal"]);
  });

  it("only treats 'effect' as a kind when nothing else is searched", () => {
    expect(parseDeckSearch("effect").filters.kinds).toEqual(["effect"]);
    expect(parseDeckSearch("effect monster").filters.kinds).toEqual(["effect"]);

    const negate = parseDeckSearch("negate effect");

    expect(negate.filters.kinds).toEqual([]);
    expect(negate.terms).toEqual(["negate", "effect"]);
  });

  it("recognises spell/trap subtypes", () => {
    expect(parseDeckSearch("quick-play").filters.spellTrapTypes).toEqual(["Quick-Play"]);
    expect(parseDeckSearch("quick play spell").filters.spellTrapTypes).toEqual(["Quick-Play"]);
    expect(parseDeckSearch("quickplay").filters.spellTrapTypes).toEqual(["Quick-Play"]);

    const continuousTrap = parseDeckSearch("continuous trap");

    expect(continuousTrap.filters.spellTrapTypes).toEqual(["Continuous"]);
    expect(continuousTrap.filters.cardTypes).toEqual(["trap"]);

    expect(parseDeckSearch("field spell").filters.spellTrapTypes).toEqual(["Field"]);
    expect(parseDeckSearch("equip").filters.spellTrapTypes).toEqual(["Equip"]);
    expect(parseDeckSearch("counter trap").filters.spellTrapTypes).toEqual(["Counter"]);
  });

  it("reads 'ritual spell' as the spell subtype, 'ritual monster' as the kind", () => {
    const spell = parseDeckSearch("ritual spell");

    expect(spell.filters.spellTrapTypes).toEqual(["Ritual"]);
    expect(spell.filters.kinds).toEqual([]);

    const monster = parseDeckSearch("ritual monster");

    expect(monster.filters.kinds).toEqual(["ritual"]);
    expect(monster.filters.spellTrapTypes).toEqual([]);

    expect(parseDeckSearch("normal trap").filters.spellTrapTypes).toEqual(["Normal"]);
  });

  it("merges repeated words into one chip", () => {
    const parsed = parseDeckSearch("dark DARK");

    expect(parsed.chips).toHaveLength(1);
    expect(parsed.chips[0].spans).toHaveLength(2);
  });
});

describe("removeChipFromQuery", () => {
  it("removes only the words the chip came from", () => {
    const query = "dark warrior level 4 destroy";
    const parsed = parseDeckSearch(query);
    const level = parsed.chips.find((chip) => chip.key === "range:level");

    expect(level).toBeDefined();
    expect(removeChipFromQuery(query, level!)).toBe("dark warrior destroy");

    const dark = parsed.chips.find((chip) => chip.label === "DARK")!;

    expect(removeChipFromQuery(query, dark)).toBe("warrior level 4 destroy");
  });

  it("removes multi-word chips and every repeat", () => {
    const query = "Winged Beast wind winged-beast";
    const parsed = parseDeckSearch(query);
    const race = parsed.chips.find((chip) => chip.label === "Winged Beast")!;

    expect(removeChipFromQuery(query, race)).toBe("wind");
  });
});

describe("matchesDeckFilters", () => {
  it("matches a DARK Warrior level 4", () => {
    const { filters } = parseDeckSearch("dark warrior level 4");

    expect(matchesDeckFilters(card({}), filters)).toBe(true);
    expect(matchesDeckFilters(card({ attribute: "LIGHT" }), filters)).toBe(false);
    expect(matchesDeckFilters(card({ level: 5 }), filters)).toBe(false);
    expect(matchesDeckFilters(card({ race: "Dragon" }), filters)).toBe(false);
  });

  it("matches nothing-set filters", () => {
    expect(matchesDeckFilters(card({}), emptyFilters())).toBe(true);
  });

  it("filters ATK ranges and excludes cards without ATK", () => {
    const { filters } = parseDeckSearch("atk 2000+");

    expect(matchesDeckFilters(card({ atk: 2400 }), filters)).toBe(true);
    expect(matchesDeckFilters(card({ atk: 1900 }), filters)).toBe(false);
    expect(
      matchesDeckFilters(
        card({ card_type: "Spell Card", race: "Normal", atk: null, def: null, level: null }),
        filters
      )
    ).toBe(false);
  });

  it("knows card kinds from card_type and the type line", () => {
    const tuner = card({ card_type: "Tuner Monster", monster_type: "Machine / Tuner / Effect" });
    const fusion = card({ card_type: "Fusion Monster", monster_type: "Dragon / Fusion / Effect" });
    const normal = card({ card_type: "Normal Monster", monster_type: "Warrior / Normal" });

    expect(matchesDeckFilters(tuner, parseDeckSearch("tuner").filters)).toBe(true);
    expect(matchesDeckFilters(fusion, parseDeckSearch("fusion").filters)).toBe(true);
    expect(matchesDeckFilters(fusion, parseDeckSearch("xyz").filters)).toBe(false);
    expect(matchesDeckFilters(normal, parseDeckSearch("effect").filters)).toBe(false);
    expect(matchesDeckFilters(tuner, parseDeckSearch("effect").filters)).toBe(true);
    expect(matchesDeckFilters(normal, parseDeckSearch("normal").filters)).toBe(true);
  });

  it("matches spell/trap subtypes via the race column", () => {
    const quickPlay = card({
      card_type: "Spell Card",
      monster_type: null,
      race: "Quick-Play",
      attribute: null,
      level: null,
      atk: null,
      def: null,
    });

    expect(matchesDeckFilters(quickPlay, parseDeckSearch("quick-play spell").filters)).toBe(true);
    expect(matchesDeckFilters(quickPlay, parseDeckSearch("quick-play trap").filters)).toBe(false);
    expect(matchesDeckFilters(quickPlay, parseDeckSearch("continuous").filters)).toBe(false);
    // A Spell's race never counts as a monster type.
    expect(matchesDeckFilters(card({}), parseDeckSearch("quick-play").filters)).toBe(false);
  });

  it("filters rank separately from level", () => {
    const xyz = card({ card_type: "XYZ Monster", monster_type: "Warrior / Xyz / Effect", level: null, rank: 4 });

    expect(matchesDeckFilters(xyz, parseDeckSearch("rank 4").filters)).toBe(true);
    expect(matchesDeckFilters(xyz, parseDeckSearch("level 4").filters)).toBe(false);
  });
});
