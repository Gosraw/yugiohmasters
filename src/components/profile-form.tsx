"use client";

import {
  FormEvent,
  useState,
  useTransition,
} from "react";

import {
  CheckCircle2,
  ImageIcon,
  LoaderCircle,
  MessageSquareText,
  Palette,
  Save,
  Sparkles,
  UserRound,
} from "lucide-react";

import {
  updateProfile,
} from "@/app/actions/profile";

type Profile = {
  id: string;

  username:
    | string
    | null;

  duelist_name: string;

  avatar_url:
    | string
    | null;

  custom_title:
    | string
    | null;

  catchphrase:
    | string
    | null;

  bio:
    | string
    | null;

  favorite_play_style:
    | string
    | null;

  favorite_card_type:
    | string
    | null;

  favorite_attribute:
    | string
    | null;

  favorite_monster_type:
    | string
    | null;

  boss_monster_option_id:
    | string
    | null;

  accent_theme:
    | string
    | null;

  signature_quote:
    | string
    | null;

  profile_banner_url:
    | string
    | null;

  boss_personality:
    | string
    | null;
};

type ProfileFormProps = {
  profile: Profile;
};

export function ProfileForm({
  profile,
}: ProfileFormProps) {
  const [
    pending,
    startTransition,
  ] = useTransition();

  const [
    message,
    setMessage,
  ] = useState<
    | {
        type:
          | "success"
          | "error";

        text: string;
      }
    | null
  >(null);

  function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage(null);

    const form =
      event.currentTarget;

    const formData =
      new FormData(form);

    startTransition(
      async () => {
        try {
          const result =
            await updateProfile(
              formData
            );

          if (
            result.error
          ) {
            setMessage({
              type:
                "error",

              text:
                result.error,
            });

            return;
          }

          setMessage({
            type:
              "success",

            text:
              result.success ??
              "Profiel opgeslagen.",
          });
        } catch (
          error
        ) {
          setMessage({
            type:
              "error",

            text:
              error instanceof
              Error
                ? error.message
                : "Profiel opslaan mislukt.",
          });
        }
      }
    );
  }

  return (
    <form
      onSubmit={
        handleSubmit
      }
      className="space-y-6"
    >
      {/* ==================================================
          CORE IDENTITY
      ================================================== */}

      <section>
        <div className="flex items-center gap-2">
          <UserRound
            size={16}
            className="text-amber-300"
          />

          <p className="text-xs font-black uppercase tracking-[.18em] text-amber-300">
            Identity
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
              Duelist Name
            </span>

            <input
              type="text"
              name="duelist_name"
              required
              minLength={2}
              maxLength={32}
              defaultValue={
                profile.duelist_name
              }
              className="field w-full"
            />
          </label>

          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
              Catchphrase
            </span>

            <input
              type="text"
              name="catchphrase"
              maxLength={160}
              defaultValue={
                profile.catchphrase ??
                ""
              }
              placeholder="It's time to duel..."
              className="field w-full"
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
            Signature Quote
          </span>

          <textarea
            name="signature_quote"
            rows={3}
            maxLength={300}
            defaultValue={
              profile.signature_quote ??
              ""
            }
            placeholder="A quote that represents your duelist identity."
            className="field w-full resize-y"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
            Bio
          </span>

          <textarea
            name="bio"
            rows={4}
            maxLength={800}
            defaultValue={
              profile.bio ??
              ""
            }
            placeholder="Tell your rivals who they're dealing with..."
            className="field w-full resize-y"
          />
        </label>
      </section>

      {/* ==================================================
          IMAGES
      ================================================== */}

      <section className="border-t border-white/[0.06] pt-6">
        <div className="flex items-center gap-2">
          <ImageIcon
            size={16}
            className="text-cyan-300"
          />

          <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">
            Visual Identity
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
              Avatar URL
            </span>

            <input
              type="text"
              name="avatar_url"
              maxLength={1000}
              defaultValue={
                profile.avatar_url ??
                ""
              }
              placeholder="https://..."
              className="field w-full"
            />
          </label>

          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
              Banner URL
            </span>

            <input
              type="text"
              name="profile_banner_url"
              maxLength={1000}
              defaultValue={
                profile.profile_banner_url ??
                ""
              }
              placeholder="https://..."
              className="field w-full"
            />
          </label>
        </div>
      </section>

      {/* ==================================================
          THEME
      ================================================== */}

      <section className="border-t border-white/[0.06] pt-6">
        <div className="flex items-center gap-2">
          <Palette
            size={16}
            className="text-violet-300"
          />

          <p className="text-xs font-black uppercase tracking-[.18em] text-violet-300">
            Style
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
              Accent Theme
            </span>

            <select
              name="accent_theme"
              defaultValue={
                profile.accent_theme ??
                "gold"
              }
              className="field w-full"
            >
              <option value="gold">
                Gold
              </option>

              <option value="blue">
                Blue
              </option>

              <option value="red">
                Red
              </option>

              <option value="purple">
                Purple
              </option>

              <option value="green">
                Green
              </option>

              <option value="cyan">
                Cyan
              </option>
            </select>
          </label>

          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
              Boss Personality
            </span>

            <select
              name="boss_personality"
              defaultValue={
                profile.boss_personality ??
                "sarcastic"
              }
              className="field w-full"
            >
              <option value="sarcastic">
                Sarcastic
              </option>

              <option value="arrogant">
                Arrogant
              </option>

              <option value="ruthless">
                Ruthless
              </option>

              <option value="honorable">
                Honorable
              </option>

              <option value="chaotic">
                Chaotic
              </option>

              <option value="supportive">
                Supportive
              </option>
            </select>
          </label>
        </div>
      </section>

      {/* ==================================================
          PREFERENCES
      ================================================== */}

      <section className="border-t border-white/[0.06] pt-6">
        <div className="flex items-center gap-2">
          <Sparkles
            size={16}
            className="text-amber-300"
          />

          <p className="text-xs font-black uppercase tracking-[.18em] text-amber-300">
            Duel Preferences
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
              Favorite Play Style
            </span>

            <input
              type="text"
              name="favorite_play_style"
              maxLength={100}
              defaultValue={
                profile.favorite_play_style ??
                ""
              }
              placeholder="Control, combo, aggro..."
              className="field w-full"
            />
          </label>

          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
              Favorite Card Type
            </span>

            <input
              type="text"
              name="favorite_card_type"
              maxLength={100}
              defaultValue={
                profile.favorite_card_type ??
                ""
              }
              placeholder="Monster, Spell..."
              className="field w-full"
            />
          </label>

          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
              Favorite Attribute
            </span>

            <input
              type="text"
              name="favorite_attribute"
              maxLength={100}
              defaultValue={
                profile.favorite_attribute ??
                ""
              }
              placeholder="DARK, LIGHT..."
              className="field w-full"
            />
          </label>

          <label>
            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-500">
              Favorite Monster Type
            </span>

            <input
              type="text"
              name="favorite_monster_type"
              maxLength={100}
              defaultValue={
                profile.favorite_monster_type ??
                ""
              }
              placeholder="Dragon, Spellcaster..."
              className="field w-full"
            />
          </label>
        </div>
      </section>

      {/* ==================================================
          MESSAGE
      ================================================== */}

      {message && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-4 ${
            message.type ===
            "success"
              ? "border-emerald-400/20 bg-emerald-400/[0.05]"
              : "border-red-400/20 bg-red-400/[0.05]"
          }`}
        >
          {message.type ===
          "success" ? (
            <CheckCircle2
              size={17}
              className="mt-0.5 shrink-0 text-emerald-300"
            />
          ) : (
            <MessageSquareText
              size={17}
              className="mt-0.5 shrink-0 text-red-300"
            />
          )}

          <p
            className={`text-sm font-bold ${
              message.type ===
              "success"
                ? "text-emerald-200"
                : "text-red-200"
            }`}
          >
            {message.text}
          </p>
        </div>
      )}

      {/* ==================================================
          SAVE
      ================================================== */}

      <button
        type="submit"
        disabled={
          pending
        }
        className="primary-button inline-flex cursor-pointer items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <LoaderCircle
            size={16}
            className="animate-spin"
          />
        ) : (
          <Save
            size={16}
          />
        )}

        {pending
          ? "Saving..."
          : "Save Identity"}
      </button>
    </form>
  );
}