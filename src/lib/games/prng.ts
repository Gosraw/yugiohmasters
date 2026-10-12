// =========================================================
// Seeded pseudo-random numbers for the mini games.
//
// Same seed string => same sequence, on every JavaScript engine
// (the browser that plays the run and the Node server that
// replays it). Only 32-bit integer math (Math.imul, shifts,
// >>> 0) is used, which every engine computes identically.
//
//   hashSeed: cyrb128 string hash -> four 32-bit words
//   sfc32:    Small Fast Counter generator (PractRand-clean)
// =========================================================

export type Prng = {
  /** Uniform float in [0, 1). */
  next: () => number;
  /** Uniform float in [min, max). */
  range: (
    min: number,
    max: number
  ) => number;
  /** Uniform integer in [min, max] (inclusive). */
  int: (
    min: number,
    max: number
  ) => number;
  /** True with the given probability (0..1). */
  chance: (
    probability: number
  ) => boolean;
};

export function hashSeed(
  seed: string
): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);

    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;

  return [
    h1 >>> 0,
    h2 >>> 0,
    h3 >>> 0,
    h4 >>> 0,
  ];
}

export function createPrng(
  seed: string
): Prng {
  let [a, b, c, d] =
    hashSeed(seed);

  function next() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;

    let t = (a + b) | 0;

    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;

    return (t >>> 0) / 4294967296;
  }

  // Warm up: the first outputs of a freshly seeded sfc32 are
  // still correlated with the seed words.
  for (let i = 0; i < 15; i++) {
    next();
  }

  return {
    next,
    range: (
      min,
      max
    ) => min + next() * (max - min),
    int: (
      min,
      max
    ) => min + Math.floor(next() * (max - min + 1)),
    chance: (
      probability
    ) => next() < probability,
  };
}
