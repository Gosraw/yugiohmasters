// =========================================================
// CARD IMAGE HELPERS
//
// Every card picture in card_catalog comes from YGOPRODeck and
// carries the card's passcode (card_catalog.external_card_id) in
// its file name:
//   https://images.ygoprodeck.com/images/cards/38520918.jpg
//   https://images.ygoprodeck.com/images/cards_small/38520918.jpg
//   https://images.ygoprodeck.com/images/cards_cropped/38520918.jpg
// A next/image src that is not `unoptimized` arrives wrapped as
// /_next/image?url=<encoded>&w=..., so the src is decoded first.
// =========================================================

const CARD_IMAGE_PATTERN =
  /images\.ygoprodeck\.com\/images\/cards(?:_small|_cropped)?\/(\d+)\.jpg/i;

/** The card passcode in a card image src, or null for any other image. */
export function cardPasscodeFromImageSrc(
  src: string | null | undefined
): number | null {
  if (!src) {
    return null;
  }

  let decoded = src;

  try {
    decoded =
      decodeURIComponent(src);
  } catch {
    // Malformed escape: match on the raw string instead.
  }

  const match =
    CARD_IMAGE_PATTERN.exec(decoded);

  if (!match) {
    return null;
  }

  const passcode =
    Number(match[1]);

  return Number.isSafeInteger(passcode) && passcode > 0
    ? passcode
    : null;
}

/** The full-size picture for a passcode (421 x 614). */
export function largeCardImageUrl(
  passcode: number
) {
  return `https://images.ygoprodeck.com/images/cards/${passcode}.jpg`;
}
