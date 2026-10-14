// =========================================================
// SOUND
//
// Tiny sound manager for the 2.0 arena announcer + SFX.
// Files live in public/v2/audio/ (generated once with
// ElevenLabs via fal.ai; generic announcer voice).
//
// Rules:
// - Never plays before the player has interacted with the
//   page (browser autoplay rules + good manners).
// - Global on/off stored in localStorage ("dc-sound"),
//   default ON. Every storage access is wrapped in try/catch
//   (private mode / blocked storage just means "ON, not
//   remembered").
// - Audio elements are created lazily on first use (or via
//   preloadSounds), never on import.
// =========================================================

const SOUND_FILES = {
  // Announcer lines
  unseal: "vo-unseal",
  legendary: "vo-legendary",
  secretRare: "vo-secret-rare",
  evolution: "vo-evolution",
  champion: "vo-champion",
  roundComplete: "vo-round",
  duel: "vo-duel",
  seasonTwo: "vo-season-two",
  victory: "vo-victory",
  weeklyComplete: "vo-weekly",
  // Effects
  seal: "sfx-seal",
  whoosh: "sfx-whoosh",
  chime: "sfx-chime",
  boom: "sfx-boom",
  coins: "sfx-coins",
  tap: "sfx-tap",
  rise: "sfx-rise",
  gameOver: "sfx-game-over",
} as const;

export type SoundName =
  keyof typeof SOUND_FILES;

const STORAGE_KEY =
  "dc-sound";

const VOLUME = 0.8;

const cache =
  new Map<
    SoundName,
    HTMLAudioElement
  >();

const listeners =
  new Set<() => void>();

let enabled: boolean | null =
  null;

let interacted = false;

function isBrowser() {
  return (
    typeof window !==
    "undefined"
  );
}

if (isBrowser()) {
  const markInteracted = () => {
    interacted = true;
  };

  window.addEventListener(
    "pointerdown",
    markInteracted,
    {
      once: true,
      capture: true,
    }
  );

  window.addEventListener(
    "keydown",
    markInteracted,
    {
      once: true,
      capture: true,
    }
  );
}

function hasInteracted() {
  if (interacted) return true;

  // Covers a tap that happened before this module loaded
  // (e.g. the "Open pack" click that navigated here).
  const activation = (
    navigator as Navigator & {
      userActivation?: {
        hasBeenActive: boolean;
      };
    }
  ).userActivation;

  return Boolean(
    activation?.hasBeenActive
  );
}

export function isSoundOn() {
  if (enabled !== null) {
    return enabled;
  }

  if (!isBrowser()) {
    return true;
  }

  try {
    enabled =
      window.localStorage.getItem(
        STORAGE_KEY
      ) !== "off";
  } catch {
    enabled = true;
  }

  return enabled;
}

export function setSoundOn(
  on: boolean
) {
  enabled = on;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      on ? "on" : "off"
    );
  } catch {
    // Storage blocked - the choice still holds for this visit.
  }

  if (!on) {
    cache.forEach((audio) => {
      audio.pause();
    });
  }

  listeners.forEach(
    (listener) => listener()
  );
}

// For useSyncExternalStore in the toggle.
export function subscribeSound(
  listener: () => void
) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getAudio(
  name: SoundName
) {
  let audio =
    cache.get(name);

  if (!audio) {
    audio = new Audio(
      `/v2/audio/${SOUND_FILES[name]}.mp3`
    );

    audio.preload = "auto";
    audio.volume = VOLUME;
    cache.set(name, audio);
  }

  return audio;
}

export function preloadSounds(
  names: SoundName[]
) {
  if (
    !isBrowser() ||
    !isSoundOn()
  ) {
    return;
  }

  names.forEach((name) => {
    getAudio(name);
  });
}

export function play(
  name: SoundName,
  delayMs = 0,
  /** 0..1; quieter for frequent in-game sounds. */
  volume = VOLUME
) {
  if (!isBrowser()) return;

  const run = () => {
    if (
      !isSoundOn() ||
      !hasInteracted()
    ) {
      return;
    }

    const base =
      getAudio(name);

    // Same sound already playing (fast taps): overlap a copy.
    const audio =
      base.paused
        ? base
        : (base.cloneNode() as HTMLAudioElement);

    audio.volume = volume;
    audio.currentTime = 0;

    audio
      .play()
      .catch(() => {
        // Autoplay blocked or file missing - stay silent.
      });
  };

  if (delayMs > 0) {
    window.setTimeout(
      run,
      delayMs
    );
  } else {
    run();
  }
}
