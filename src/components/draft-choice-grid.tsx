"use client";

import Image from "next/image";
import {
  Check,
  Eye,
  Sparkles,
  X,
  Swords,
  Shield,
  Star,
  Layers3,
  Gauge,
} from "lucide-react";
import { useState } from "react";
import { pickDraftCard } from "@/app/actions/draft";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export type DraftChoiceCard = {
  optionId: string;
  id: string;
  name: string;
  image_url: string | null;
  card_type: string;
  monster_type: string | null;
  attribute: string | null;
  level: number | null;
  rank: number | null;
  atk: number | null;
  def: number | null;
  description: string | null;
  game_rarity: string | null;
  rarity_score: number | null;
};

const rarityStyles: Record<string, string> = {
  Normal:
    "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",

  Rare:
    "border-blue-400/30 bg-blue-400/10 text-blue-300",

  "Super Rare":
    "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",

  "Ultra Rare":
    "border-amber-300/40 bg-amber-300/10 text-amber-200",

  "Secret Rare":
    "border-violet-300/40 bg-violet-300/10 text-violet-200",

  Legendary:
    "border-yellow-300/50 bg-yellow-300/15 text-yellow-200 shadow-[0_0_30px_rgba(250,204,21,0.12)]",
};

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {label}
      </p>

      <p className="mt-1 font-black text-zinc-100">
        {value}
      </p>
    </div>
  );
}

export function DraftChoiceGrid({
  offerId,
  cards,
}: {
  offerId: string;
  cards: DraftChoiceCard[];
}) {
  const [detailCard, setDetailCard] =
    useState<DraftChoiceCard | null>(null);

  return (
    <>
      <section className="mx-auto mt-7 grid max-w-5xl grid-cols-3 gap-3 sm:gap-5">
        {cards.map((card) => {
          const rarity =
            card.game_rarity ?? "Not Rated";

          const rarityStyle =
            rarityStyles[rarity] ??
            rarityStyles.Normal;

          return (
            <article
              key={card.optionId}
              className="panel flex min-w-0 flex-col overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setDetailCard(card)
                }
                className="group relative block w-full bg-black/20 p-2 sm:p-3"
              >
                {card.image_url ? (
                  <Image
                    src={card.image_url}
                    alt={card.name}
                    width={421}
                    height={614}
                    className="mx-auto h-auto w-full max-w-[190px] rounded-md transition group-hover:scale-[1.02]"
                    unoptimized
                  />
                ) : (
                  <div className="mx-auto flex aspect-[421/614] w-full max-w-[190px] items-center justify-center rounded-md bg-zinc-900 text-xs text-zinc-600">
                    No image
                  </div>
                )}

                {/* Preview affordance only - kept out of the
                    bottom-right corner (where a monster's printed
                    ATK/DEF sits) and out of the top-left (where the
                    name starts); top-right is clear on these card
                    assets. Desktop-only hint, same as before. */}
                <span className="pointer-events-none absolute right-2 top-2 hidden rounded-full border border-white/10 bg-black/80 p-1.5 text-white sm:block">
                  <Eye size={13} />
                </span>
              </button>

              <div className="flex flex-1 flex-col p-2 sm:p-4">
                <span
                  className={`self-start rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wider sm:text-[10px] ${rarityStyle}`}
                >
                  {rarity}
                </span>

                <h2 className="mt-2 line-clamp-2 min-h-10 text-xs font-black leading-4 text-zinc-100 sm:text-base sm:leading-5">
                  {card.name}
                </h2>

                <p className="mt-1 truncate text-[9px] text-zinc-500 sm:text-xs">
                  {card.card_type}
                </p>

                <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-zinc-400 sm:text-xs">
                  {card.atk != null && (
                    <span>
                      ATK{" "}
                      <strong className="text-zinc-200">
                        {card.atk}
                      </strong>
                    </span>
                  )}

                  {card.def != null && (
                    <span>
                      DEF{" "}
                      <strong className="text-zinc-200">
                        {card.def}
                      </strong>
                    </span>
                  )}
                </div>

                <div className="mt-auto grid gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      setDetailCard(card)
                    }
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-2 py-2 text-[10px] font-bold text-zinc-300 transition hover:bg-white/5 sm:text-sm"
                  >
                    <Eye size={14} />
                    Details
                  </button>

                  <form
                    action={pickDraftCard}
                  >
                    <input
                      type="hidden"
                      name="offer_id"
                      value={offerId}
                    />

                    <input
                      type="hidden"
                      name="option_id"
                      value={card.optionId}
                    />

                    <ConfirmSubmitButton
                      confirmMessage={`Draft ${card.name}? This choice is final.`}
                      pendingLabel="Choosing..."
                      className="primary-button flex w-full items-center justify-center gap-1 px-2 py-2 text-[10px] sm:gap-2 sm:text-sm"
                    >
                      <Check size={14} />
                      Choose
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {detailCard && (
        <div
          className="fixed inset-0 z-[100] overflow-y-auto bg-black/85 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-6"
          onClick={() =>
            setDetailCard(null)
          }
        >
          <div
            className="mx-auto my-4 max-w-5xl rounded-2xl border border-white/10 bg-[#0b0d12] shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4 sm:p-5">
              <div>
                <p className="text-xs font-black tracking-[.2em] text-amber-300">
                  CARD DETAILS
                </p>

                <h2 className="mt-1 text-xl font-black sm:text-2xl">
                  {detailCard.name}
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setDetailCard(null)
                }
                className="rounded-xl border border-white/10 p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-5 p-4 sm:p-6 md:grid-cols-[260px_1fr]">
              <div>
                {detailCard.image_url ? (
                  <Image
                    src={
                      detailCard.image_url
                    }
                    alt={
                      detailCard.name
                    }
                    width={421}
                    height={614}
                    className="mx-auto h-auto w-full max-w-[260px] rounded-lg"
                    unoptimized
                  />
                ) : (
                  <div className="flex aspect-[421/614] items-center justify-center rounded-lg bg-zinc-900">
                    No image
                  </div>
                )}

                <form
                  action={pickDraftCard}
                  className="mt-4"
                >
                  <input
                    type="hidden"
                    name="offer_id"
                    value={offerId}
                  />

                  <input
                    type="hidden"
                    name="option_id"
                    value={
                      detailCard.optionId
                    }
                  />

                  <ConfirmSubmitButton
                    confirmMessage={`Draft ${detailCard.name}? This choice is final.`}
                    pendingLabel="Choosing..."
                    className="primary-button flex w-full items-center justify-center gap-2"
                  >
                    <Check size={17} />
                    Choose this card
                  </ConfirmSubmitButton>
                </form>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black uppercase ${rarityStyles[detailCard.game_rarity ?? ""] ?? rarityStyles.Normal}`}
                  >
                    <Sparkles
                      size={14}
                    />
                    {detailCard.game_rarity ??
                      "Not Rated"}
                  </span>

                  <span className="text-sm text-zinc-500">
                    {
                      detailCard.card_type
                    }
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {detailCard.attribute && (
                    <Stat
                      label="Attribute"
                      value={
                        detailCard.attribute
                      }
                    />
                  )}

                  {detailCard.monster_type && (
                    <Stat
                      label="Type"
                      value={
                        detailCard.monster_type
                      }
                    />
                  )}

                  {detailCard.level !=
                    null && (
                    <Stat
                      label="Level"
                      value={
                        detailCard.level
                      }
                    />
                  )}

                  {detailCard.rank !=
                    null && (
                    <Stat
                      label="Rank"
                      value={
                        detailCard.rank
                      }
                    />
                  )}

                  {detailCard.atk !=
                    null && (
                    <Stat
                      label="ATK"
                      value={
                        detailCard.atk
                      }
                    />
                  )}

                  {detailCard.def !=
                    null && (
                    <Stat
                      label="DEF"
                      value={
                        detailCard.def
                      }
                    />
                  )}

                  {detailCard.rarity_score !=
                    null && (
                    <Stat
                      label="Power"
                      value={`${Number(
                        detailCard.rarity_score
                      ).toFixed(
                        1
                      )} / 100`}
                    />
                  )}
                </div>

                <div className="panel mt-5 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-amber-300">
                    <Layers3
                      size={17}
                    />

                    <h3 className="font-black">
                      Card Text
                    </h3>
                  </div>

                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-zinc-300">
                    {detailCard.description ??
                      "No card text available."}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {detailCard.level !=
                    null && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Star size={15} />
                      Level{" "}
                      {
                        detailCard.level
                      }
                    </div>
                  )}

                  {detailCard.atk !=
                    null && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Swords size={15} />
                      ATK{" "}
                      {detailCard.atk}
                    </div>
                  )}

                  {detailCard.def !=
                    null && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Shield size={15} />
                      DEF{" "}
                      {detailCard.def}
                    </div>
                  )}

                  {detailCard.rarity_score !=
                    null && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Gauge size={15} />
                      Power{" "}
                      {Number(
                        detailCard.rarity_score
                      ).toFixed(1)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}