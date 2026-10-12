"use client";

import {
  useSyncExternalStore,
} from "react";

import {
  Volume2,
  VolumeX,
} from "lucide-react";

import {
  isSoundOn,
  play,
  setSoundOn,
  subscribeSound,
} from "@/lib/sound";

// =========================================================
// SOUND TOGGLE
//
// Profile setting: arena announcer + sound effects on/off.
// Stored per device (localStorage) by src/lib/sound.ts.
// =========================================================

export function SoundToggle() {
  const on =
    useSyncExternalStore(
      subscribeSound,
      isSoundOn,
      () => true
    );

  const toggle = () => {
    setSoundOn(!on);

    if (!on) {
      play("tap");
    }
  };

  return (
    <div className="panel relative flex items-center gap-3 overflow-hidden p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200">
        {on ? (
          <Volume2
            size={18}
          />
        ) : (
          <VolumeX
            size={18}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-zinc-100">
          Sound
        </p>

        <p className="text-xs text-zinc-400">
          Arena announcer and sound effects on this device.
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Sound"
        onClick={toggle}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
          on
            ? "border-amber-300/60 bg-amber-300/30"
            : "border-white/15 bg-white/5"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-[22px] w-[22px] rounded-full transition-transform motion-reduce:transition-none ${
            on
              ? "translate-x-5 bg-amber-200"
              : "translate-x-0 bg-zinc-400"
          }`}
        />
      </button>
    </div>
  );
}
