"use client";

import {
  useMemo,
} from "react";

import {
  CheckCircle2,
  LockKeyhole,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Swords,
} from "lucide-react";

import {
  archiveDeck,
  markDeckDraft,
  markDeckReady,
  renameDeck,
  setActiveDeck,
} from "@/app/actions/decks";

import {
  computeDeckComposition,
  computeOwnedVsUsed,
  type DeckCompositionCard,
} from "@/lib/deck-composition";

import {
  evaluateMasterDuelDeckLegality,
  getMasterDuelStatusMeta,
} from "@/lib/master-duel";

import {
  EXPORT_DISCLAIMER,
  buildMasterDuelChecklist,
  buildYdkExport,
  type MasterDuelExportCardInput,
} from "@/lib/master-duel-export";

import {
  DeckCompositionSummary,
} from "@/components/deck-composition-summary";

import {
  ArchiveDeckButton,
  RenameDeckButton,
} from "@/components/deck-management-buttons";

import {
  DeckStatusButton,
} from "@/components/deck-status-button";

import {
  MasterDuelExportPanel,
} from "@/components/master-duel-export-panel";

import {
  TestHandButton,
  type TestHandCard,
} from "@/components/test-hand";

import {
  DeckDoctorPanel,
} from "./deck-doctor-panel";

import {
  largeImage,
  sectionForCardType,
  type BuilderCard,
  type BuilderDeck,
} from "./types";

// =========================================================
// MORE
//
// Everything that isn't adding/removing cards: deck status, stats,
// test hand, Deck Doctor, Master Duel check + export, rename/archive.
// All of it follows the builder's live deck state, so it is correct
// without reloading the page after a change.
// =========================================================

export function readyReasons(
  mainCount: number,
  extraCount: number,
  overLimit: {
    name: string;
    limit: number;
  }[] = []
): string[] {
  const reasons: string[] = [];

  for (const card of overLimit) {
    reasons.push(
      card.limit === 0
        ? `Remove ${card.name} - it is Forbidden in this format.`
        : `${card.name} is limited to ${card.limit} per deck - remove the extra copies.`
    );
  }

  if (mainCount < 40) {
    const short =
      40 - mainCount;

    reasons.push(
      `Add ${short} more Main Deck card${short === 1 ? "" : "s"} (${mainCount}/40 minimum).`
    );
  }

  if (mainCount > 60) {
    const over =
      mainCount - 60;

    reasons.push(
      `Remove ${over} Main Deck card${over === 1 ? "" : "s"} (${mainCount}, maximum 60).`
    );
  }

  if (extraCount > 15) {
    const over =
      extraCount - 15;

    reasons.push(
      `Remove ${over} Extra Deck card${over === 1 ? "" : "s"} (${extraCount}, maximum 15).`
    );
  }

  return reasons;
}

function DeckIdInput({
  deckId,
}: {
  deckId: string;
}) {
  return (
    <input
      type="hidden"
      name="deck_id"
      value={deckId}
    />
  );
}

export function DeckMore({
  deck,
  cards,
  countByCard,
  mainCount,
  extraCount,
  saving,
  deckSignature,
}: {
  deck: BuilderDeck;
  cards: BuilderCard[];
  countByCard: ReadonlyMap<string, number>;
  mainCount: number;
  extraCount: number;
  saving: boolean;
  deckSignature: string;
}) {
  // One entry per physical copy, Main and Extra separately - the
  // shape every existing deck helper expects.
  const {
    mainCopies,
    extraCopies,
  } = useMemo(() => {
    const main: BuilderCard[] = [];
    const extra: BuilderCard[] = [];

    for (const card of cards) {
      const count =
        countByCard.get(
          card.id
        ) ?? 0;

      const target =
        sectionForCardType(
          card.card_type
        ) === "extra"
          ? extra
          : main;

      for (let i = 0; i < count; i++) {
        target.push(card);
      }
    }

    return {
      mainCopies: main,
      extraCopies: extra,
    };
  }, [cards, countByCard]);

  const derived =
    useMemo(() => {
      const toComposition = (
        card: BuilderCard
      ): DeckCompositionCard => ({
        card_catalog_id:
          card.id,
        name: card.name,
        card_type:
          card.card_type,
        monster_type:
          card.monster_type,
        attribute:
          card.attribute,
        level: card.level,
        rank: card.rank,
        link_rating:
          card.link_rating,
        archetype:
          card.archetype,
      });

      const all = [
        ...mainCopies,
        ...extraCopies,
      ];

      const composition =
        computeDeckComposition(
          mainCopies.map(
            toComposition
          ),
          extraCopies.map(
            toComposition
          )
        );

      const ownedVsUsed =
        computeOwnedVsUsed(
          all.map(
            (card) => ({
              card_catalog_id:
                card.id,
              name: card.name,
            })
          ),
          new Map(
            cards.map(
              (card) => [
                card.id,
                card.copies.length,
              ]
            )
          )
        );

      const masterDuel =
        evaluateMasterDuelDeckLegality(
          all.map(
            (card) => ({
              id: card.id,
              name: card.name,
              master_duel_status:
                card.master_duel_status,
            })
          )
        );

      const exportCards: MasterDuelExportCardInput[] =
        all.map(
          (card) => ({
            cardCatalogId:
              card.id,
            name: card.name,
            externalCardId:
              card.external_card_id,
            masterDuelCardId:
              card.master_duel_card_id,
            masterDuelStatus:
              card.master_duel_status,
            section:
              sectionForCardType(
                card.card_type
              ),
          })
        );

      const testHand: TestHandCard[] =
        mainCopies.map(
          (card, index) => ({
            id: `${card.id}:${index}`,
            name: card.name,
            image_url:
              largeImage(
                card.image
              ),
          })
        );

      return {
        composition,
        ownedVsUsed,
        masterDuel,
        ydk:
          buildYdkExport(
            exportCards
          ),
        checklist:
          buildMasterDuelChecklist(
            exportCards,
            (status) =>
              getMasterDuelStatusMeta(
                status
              ).shortLabel
          ),
        testHand,
      };
    }, [
      cards,
      mainCopies,
      extraCopies,
    ]);

  const reasons =
    readyReasons(
      mainCount,
      extraCount,
      cards
        .filter(
          (card) =>
            card.copy_limit !== null &&
            (countByCard.get(
              card.id
            ) ?? 0) >
              card.copy_limit
        )
        .map(
          (card) => ({
            name: card.name,
            limit:
              card.copy_limit ?? 0,
          })
        )
    );

  const canBeReady =
    reasons.length === 0;

  const hasCards =
    mainCount +
      extraCount >
    0;

  return (
    <div className="space-y-3">
      {/* STATUS */}

      <section className="panel p-4 sm:p-5">
        <div className="flex items-center gap-2">
          {deck.status === "draft" ? (
            <Sparkles
              size={18}
              className="text-amber-300"
            />
          ) : (
            <CheckCircle2
              size={18}
              className={
                deck.isActive
                  ? "text-cyan-300"
                  : "text-emerald-300"
              }
            />
          )}

          <h2 className="font-black">
            Deck status
          </h2>
        </div>

        {deck.status === "draft" ? (
          canBeReady ? (
            <p className="mt-2 text-sm text-emerald-300">
              This deck can be marked Ready.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {reasons.map(
                (reason) => (
                  <li
                    key={reason}
                    className="flex items-start gap-2"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
                    <span>
                      {reason}
                    </span>
                  </li>
                )
              )}
            </ul>
          )
        ) : deck.status === "archived" ? (
          <p className="mt-2 text-sm text-zinc-400">
            This deck is archived.
          </p>
        ) : deck.isActive ? (
          <p className="mt-2 text-sm text-cyan-200">
            Ready and selected as your Active Deck.
          </p>
        ) : (
          <p className="mt-2 text-sm text-emerald-300">
            This deck is valid and Ready to use.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {deck.status === "draft" && (
            <form
              action={markDeckReady}
            >
              <DeckIdInput
                deckId={deck.id}
              />

              <DeckStatusButton
                action="ready"
                disabled={
                  !canBeReady ||
                  saving
                }
                label={
                  saving
                    ? "Saving changes..."
                    : canBeReady
                      ? "Mark as Ready"
                      : "Not Ready Yet"
                }
              />
            </form>
          )}

          {deck.status === "ready" &&
            !deck.isActive && (
              <>
                <form
                  action={setActiveDeck}
                >
                  <DeckIdInput
                    deckId={deck.id}
                  />

                  <DeckStatusButton
                    action="active"
                  />
                </form>

                <form
                  action={markDeckDraft}
                >
                  <DeckIdInput
                    deckId={deck.id}
                  />

                  <DeckStatusButton
                    action="edit"
                  />
                </form>
              </>
            )}

          {deck.status === "ready" &&
            deck.isActive && (
              <span className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-sm font-black text-cyan-200">
                <LockKeyhole
                  size={16}
                />
                Active Deck
              </span>
            )}
        </div>
      </section>

      {/* STATS + TEST HAND */}

      <DeckCompositionSummary
        composition={
          derived.composition
        }
        ownedVsUsed={
          derived.ownedVsUsed
        }
      />

      <TestHandButton
        mainDeckCards={
          derived.testHand
        }
      />

      {/* DECK DOCTOR */}

      {hasCards && (
        <DeckDoctorPanel
          deckId={deck.id}
          deckSignature={
            deckSignature
          }
          saving={saving}
        />
      )}

      {/* MASTER DUEL */}

      {hasCards && (
        <section
          className={`rounded-2xl border p-4 ${
            derived.masterDuel.ready
              ? "border-emerald-300/15 bg-emerald-300/[0.03]"
              : "border-amber-300/15 bg-amber-300/[0.03]"
          }`}
        >
          <div className="flex items-start gap-3">
            {derived.masterDuel.ready ? (
              <ShieldCheck
                size={17}
                className="mt-0.5 shrink-0 text-emerald-300"
              />
            ) : (
              <ShieldAlert
                size={17}
                className="mt-0.5 shrink-0 text-amber-300"
              />
            )}

            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-black uppercase tracking-wide ${
                  derived.masterDuel.ready
                    ? "text-emerald-100"
                    : "text-amber-100"
                }`}
              >
                {derived.masterDuel.ready
                  ? "Master Duel Ready"
                  : `${derived.masterDuel.issues.length} Master Duel issue${
                      derived.masterDuel.issues.length === 1
                        ? ""
                        : "s"
                    }`}
              </p>

              {derived.masterDuel.ready ? (
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  Every card in this deck exists in Master Duel, so it
                  works in an Unlimited Duel Room.
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs leading-5 text-zinc-300">
                  {derived.masterDuel.issues.map(
                    (issue) => (
                      <li
                        key={issue.cardId}
                        className="flex items-start gap-2"
                      >
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
                        <span>
                          {issue.message}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {hasCards && (
        <section className="panel p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Swords
              size={18}
              className="text-amber-300"
            />

            <h2 className="font-black">
              Export for Master Duel
            </h2>
          </div>

          <MasterDuelExportPanel
            deckName={deck.name}
            disclaimer={
              EXPORT_DISCLAIMER
            }
            ydkText={
              derived.ydk.ydkText
            }
            checklistText={
              derived.checklist.checklistText
            }
            missingPasscodeCount={
              derived.ydk.missingPasscodeCards.length
            }
          />
        </section>
      )}

      {/* SETTINGS */}

      <section className="panel p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Settings
            size={18}
            className="text-amber-300"
          />

          <h2 className="font-black">
            Deck settings
          </h2>
        </div>

        <form
          action={renameDeck}
          className="mt-4 flex flex-col gap-2 sm:flex-row"
        >
          <DeckIdInput
            deckId={deck.id}
          />

          <label
            className="sr-only"
            htmlFor="deck-name"
          >
            Deck name
          </label>

          <input
            id="deck-name"
            type="text"
            name="name"
            required
            maxLength={80}
            defaultValue={deck.name}
            disabled={
              deck.status === "archived"
            }
            className="field flex-1 disabled:cursor-not-allowed disabled:opacity-50"
          />

          <RenameDeckButton />
        </form>

        <div className="mt-4 rounded-xl border border-red-400/15 bg-red-400/[0.035] p-4">
          <p className="text-sm font-black text-red-200">
            Archive deck
          </p>

          <p className="mt-1.5 text-xs leading-5 text-zinc-400">
            Archiving hides this deck from normal use but keeps it for
            match history.
          </p>

          {deck.isActive && (
            <p className="mt-2 text-xs font-bold text-red-300">
              Active decks can&apos;t be archived.
            </p>
          )}

          <form
            action={archiveDeck}
            className="mt-3"
          >
            <DeckIdInput
              deckId={deck.id}
            />

            <ArchiveDeckButton
              disabled={
                deck.isActive ||
                deck.status === "archived"
              }
            />
          </form>
        </div>
      </section>

      {/* RULES */}

      <section className="panel p-4 text-xs leading-5 text-zinc-400 sm:p-5">
        <p className="text-sm font-black text-zinc-200">
          Deck rules
        </p>
        <ul className="mt-2 space-y-1">
          <li>Main Deck: 40 to 60 cards.</li>
          <li>Extra Deck: up to 15 cards - Fusion and Xyz Monsters only.</li>
          <li>You can only use physical copies you own.</li>
          <li>Ready decks are locked until moved back to Draft.</li>
        </ul>
      </section>
    </div>
  );
}
