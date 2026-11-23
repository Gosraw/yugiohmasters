import {
  describe,
  expect,
  it,
} from "vitest";

import {
  cardPasscodeFromImageSrc,
  largeCardImageUrl,
} from "./card-image";

describe("cardPasscodeFromImageSrc", () => {
  it("reads the passcode from full, small and cropped pictures", () => {
    expect(
      cardPasscodeFromImageSrc(
        "https://images.ygoprodeck.com/images/cards/38520918.jpg"
      )
    ).toBe(38520918);

    expect(
      cardPasscodeFromImageSrc(
        "https://images.ygoprodeck.com/images/cards_small/15480588.jpg"
      )
    ).toBe(15480588);

    expect(
      cardPasscodeFromImageSrc(
        "https://images.ygoprodeck.com/images/cards_cropped/77585513.jpg"
      )
    ).toBe(77585513);
  });

  it("reads a next/image optimizer src", () => {
    expect(
      cardPasscodeFromImageSrc(
        "/_next/image?url=https%3A%2F%2Fimages.ygoprodeck.com%2Fimages%2Fcards%2F38520918.jpg&w=640&q=75"
      )
    ).toBe(38520918);
  });

  it("ignores other images and empty values", () => {
    expect(
      cardPasscodeFromImageSrc(
        "/images/pack-premium.webp"
      )
    ).toBeNull();

    expect(
      cardPasscodeFromImageSrc(
        "https://example.com/images/cards/123.jpg"
      )
    ).toBeNull();

    expect(
      cardPasscodeFromImageSrc(
        ""
      )
    ).toBeNull();

    expect(
      cardPasscodeFromImageSrc(
        null
      )
    ).toBeNull();
  });

  it("does not throw on a malformed escape", () => {
    expect(
      cardPasscodeFromImageSrc(
        "https://images.ygoprodeck.com/images/cards/42.jpg?x=%E0%A4%A"
      )
    ).toBe(42);
  });
});

describe("largeCardImageUrl", () => {
  it("builds the full-size picture url", () => {
    expect(
      largeCardImageUrl(
        38520918
      )
    ).toBe(
      "https://images.ygoprodeck.com/images/cards/38520918.jpg"
    );
  });
});
