import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Home,
  LockKeyhole,
  Minus,
  Repeat2,
  Send,
  UserRound,
  XCircle,
} from "lucide-react";

import {
  acceptTrade,
  cancelTrade,
  declineTrade,
  removeTradeItem,
  submitTrade,
} from "@/app/actions/trades";

import {
  TradeCollectionBrowser,
  type TradeBrowserCard,
} from "@/components/trade-collection-browser";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  SubmitButton,
} from "@/components/submit-button";

import {
  ConfirmSubmitButton,
} from "@/components/confirm-submit-button";

export const dynamic = "force-dynamic";

type Trade = {
  id: string;
  league_id: string;
  created_by: string;
  sender_id: string;
  receiver_id: string;

  status:
    | "draft"
    | "pending"
    | "accepted"
    | "declined"
    | "cancelled";

  message: string | null;
  created_at: string;
  submitted_at: string | null;
  completed_at: string | null;
};

type TradeItem = {
  id: string;
  card_instance_id: string;

  side:
    | "offered"
    | "requested";

  added_by: string;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type CardInstance = {
  id: string;
  card_catalog_id: string;
  current_owner_id: string;
  copy_number: number;
  locked: boolean;
  lock_type: string | null;
};

type CardCatalog = {
  id: string;
  name: string;
  image_url: string | null;
  card_type: string;
  game_rarity: string | null;
  rarity_score: number | null;
  atk: number | null;
  def: number | null;
};

type CollectionGroup = {
  card: CardCatalog;
  instances: CardInstance[];
  availableInstances: CardInstance[];
  selectedCount: number;
};

type SelectedTradeCard = {
  tradeItem: TradeItem;
  instance: CardInstance;
  card: CardCatalog;
};

function playerName(
  profile: Profile | undefined
) {
  return (
    profile?.display_name ??
    profile?.username ??
    "Unknown Player"
  );
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  return new Date(
    value
  ).toLocaleString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function TradeStatusBadge({
  status,
}: {
  status: Trade["status"];
}) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-200">
        <Clock3 size={12} />
        Pending
      </span>
    );
  }

  if (status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-200">
        <CheckCircle2 size={12} />
        Accepted
      </span>
    );
  }

  if (status === "declined") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-200">
        <XCircle size={12} />
        Declined
      </span>
    );
  }

  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400">
        <XCircle size={12} />
        Cancelled
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-200">
      <Repeat2 size={12} />
      Draft
    </span>
  );
}

function SelectedCardTile({
  item,
  tradeId,
  removable,
}: {
  item: SelectedTradeCard;
  tradeId: string;
  removable: boolean;
}) {
  const {
    tradeItem,
    instance,
    card,
  } = item;

  const returnTo =
    `/trades/${tradeId}`;

  return (
    <div className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/20 transition-all hover:-translate-y-1 hover:border-amber-300/25">
      <Link
        href={`/cards/${card.id}?returnTo=${encodeURIComponent(
          returnTo
        )}`}
        className="block cursor-pointer"
      >
        {card.image_url ? (
          <Image
            src={card.image_url}
            alt={card.name}
            width={421}
            height={614}
            className="aspect-[421/614] h-auto w-full object-cover"
            unoptimized
          />
        ) : (
          <div className="aspect-[421/614] bg-zinc-900" />
        )}
      </Link>

      <span className="pointer-events-none absolute left-1 top-1 rounded-md border border-white/10 bg-black/85 px-1.5 py-0.5 text-[8px] font-black">
        #{instance.copy_number}
      </span>

      {removable && (
        <form
          action={removeTradeItem}
          className="absolute bottom-1 right-1"
        >
          <input
            type="hidden"
            name="trade_id"
            value={tradeId}
          />

          <input
            type="hidden"
            name="trade_item_id"
            value={tradeItem.id}
          />

          <SubmitButton
            title="Remove from trade"
            pendingLabel=""
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-red-400/30 bg-black/90 text-red-300 transition-all hover:scale-110 hover:bg-red-400/20 active:scale-90"
          >
            <Minus size={15} />
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;

  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    data: tradeData,
    error: tradeError,
  } = await supabase
    .from("trades")
    .select(
      "id,league_id,created_by,sender_id,receiver_id,status,message,created_at,submitted_at,completed_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (
    tradeError ||
    !tradeData
  ) {
    notFound();
  }

  const trade =
    tradeData as Trade;

  const isSender =
    trade.sender_id === userId;

  const isReceiver =
    trade.receiver_id === userId;

  if (
    !isSender &&
    !isReceiver
  ) {
    notFound();
  }

  const editable =
    trade.status === "draft" &&
    isSender;

  const {
    data: profileData,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      "id,username,display_name"
    )
    .in(
      "id",
      [
        trade.sender_id,
        trade.receiver_id,
      ]
    );

  if (profileError) {
    throw new Error(
      profileError.message
    );
  }

  const profiles =
    (profileData ?? []) as Profile[];

  const profileMap =
    new Map(
      profiles.map(
        (profile) => [
          profile.id,
          profile,
        ]
      )
    );

  const sender =
    profileMap.get(
      trade.sender_id
    );

  const receiver =
    profileMap.get(
      trade.receiver_id
    );

  const {
    data: tradeItemData,
    error: tradeItemError,
  } = await supabase
    .from("trade_items")
    .select(
      "id,card_instance_id,side,added_by"
    )
    .eq(
      "trade_id",
      trade.id
    );

  if (tradeItemError) {
    throw new Error(
      tradeItemError.message
    );
  }

  const tradeItems =
    (tradeItemData ?? []) as TradeItem[];

  const selectedInstanceIds =
    new Set(
      tradeItems.map(
        (item) =>
          item.card_instance_id
      )
    );

  const {
    data: instanceData,
    error: instanceError,
  } = await supabase
    .from("card_instances")
    .select(
      "id,card_catalog_id,current_owner_id,copy_number,locked,lock_type"
    )
    .eq(
      "league_id",
      trade.league_id
    )
    .in(
      "current_owner_id",
      [
        trade.sender_id,
        trade.receiver_id,
      ]
    )
    .order(
      "copy_number",
      {
        ascending: true,
      }
    );

  if (instanceError) {
    throw new Error(
      `Collections konden niet worden geladen: ${instanceError.message}`
    );
  }

  const instances =
    (instanceData ?? []) as CardInstance[];

  const catalogIds = [
    ...new Set(
      instances.map(
        (instance) =>
          instance.card_catalog_id
      )
    ),
  ];

  let catalog:
    CardCatalog[] =
    [];

  if (
    catalogIds.length > 0
  ) {
    const {
      data: catalogData,
      error: catalogError,
    } = await supabase
      .from("card_catalog")
      .select(
        "id,name,image_url,card_type,game_rarity,rarity_score,atk,def"
      )
      .in(
        "id",
        catalogIds
      );

    if (catalogError) {
      throw new Error(
        catalogError.message
      );
    }

    catalog =
      (catalogData ?? []) as CardCatalog[];
  }

  const cardMap =
    new Map(
      catalog.map(
        (card) => [
          card.id,
          card,
        ]
      )
    );

  const instanceMap =
    new Map(
      instances.map(
        (instance) => [
          instance.id,
          instance,
        ]
      )
    );

  const offeredCards:
    SelectedTradeCard[] =
    [];

  const requestedCards:
    SelectedTradeCard[] =
    [];

  for (
    const tradeItem of
    tradeItems
  ) {
    const instance =
      instanceMap.get(
        tradeItem.card_instance_id
      );

    if (!instance) {
      continue;
    }

    const card =
      cardMap.get(
        instance.card_catalog_id
      );

    if (!card) {
      continue;
    }

    const selected = {
      tradeItem,
      instance,
      card,
    };

    if (
      tradeItem.side ===
      "offered"
    ) {
      offeredCards.push(
        selected
      );
    } else {
      requestedCards.push(
        selected
      );
    }
  }

  function buildCollection(
    ownerId: string
  ) {
    const grouped =
      new Map<
        string,
        CollectionGroup
      >();

    for (
      const instance of
      instances
    ) {
      if (
        instance.current_owner_id !==
        ownerId
      ) {
        continue;
      }

      const card =
        cardMap.get(
          instance.card_catalog_id
        );

      if (!card) {
        continue;
      }

      const selected =
        selectedInstanceIds.has(
          instance.id
        );

      const available =
        !instance.locked &&
        !selected;

      const current =
        grouped.get(
          card.id
        );

      if (current) {
        current.instances.push(
          instance
        );

        if (available) {
          current.availableInstances.push(
            instance
          );
        }

        if (selected) {
          current.selectedCount += 1;
        }

        continue;
      }

      grouped.set(
        card.id,
        {
          card,
          instances: [
            instance,
          ],
          availableInstances:
            available
              ? [instance]
              : [],
          selectedCount:
            selected
              ? 1
              : 0,
        }
      );
    }

    return [
      ...grouped.values(),
    ].sort(
      (a, b) =>
        a.card.name.localeCompare(
          b.card.name
        )
    );
  }

  const senderCollection =
    buildCollection(
      trade.sender_id
    );

  const receiverCollection =
    buildCollection(
      trade.receiver_id
    );

  const senderBrowserCards:
    TradeBrowserCard[] =
    senderCollection.map(
      (group) => ({
        card:
          group.card,

        quantity:
          group.instances.length,

        selectedCount:
          group.selectedCount,

        availableInstances:
          group.availableInstances.map(
            (instance) => ({
              id:
                instance.id,
              copy_number:
                instance.copy_number,
            })
          ),
      })
    );

  const receiverBrowserCards:
    TradeBrowserCard[] =
    receiverCollection.map(
      (group) => ({
        card:
          group.card,

        quantity:
          group.instances.length,

        selectedCount:
          group.selectedCount,

        availableInstances:
          group.availableInstances.map(
            (instance) => ({
              id:
                instance.id,
              copy_number:
                instance.copy_number,
            })
          ),
      })
    );

  return (
    <main className="mx-auto max-w-[1700px] px-4 py-6 sm:px-6 lg:px-8">
      {/* NAV */}

      <nav className="flex flex-wrap items-center gap-3">
        <Link
          href="/trades"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:-translate-x-0.5 hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-200 active:scale-95"
        >
          <ArrowLeft size={17} />
          Back to Trades
        </Link>

        <Link
          href="/"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100 active:scale-95"
        >
          <Home size={16} />
          Home
        </Link>
      </nav>

      {/* HEADER */}

      <header className="mt-6">
        <TradeStatusBadge
          status={trade.status}
        />

        <p className="mt-5 text-xs font-black tracking-[.28em] text-amber-300">
          CARD TRADE
        </p>

        <h1 className="gold-text mt-2 text-4xl font-black">
          {playerName(sender)} ↔{" "}
          {playerName(receiver)}
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          Created{" "}
          {formatDate(
            trade.created_at
          )}
        </p>
      </header>

      {/* SUMMARY */}

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="flex items-center gap-2">
            <UserRound
              size={17}
              className="text-amber-300"
            />

            <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Offered by{" "}
              {playerName(sender)}
            </p>
          </div>

          {offeredCards.length ===
          0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              No cards offered yet.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-5 xl:grid-cols-7">
              {offeredCards.map(
                (item) => (
                  <SelectedCardTile
                    key={
                      item.tradeItem.id
                    }
                    item={item}
                    tradeId={trade.id}
                    removable={
                      editable
                    }
                  />
                )
              )}
            </div>
          )}
        </div>

        <div className="panel p-5">
          <div className="flex items-center gap-2">
            <Repeat2
              size={17}
              className="text-cyan-300"
            />

            <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Requested from{" "}
              {playerName(receiver)}
            </p>
          </div>

          {requestedCards.length ===
          0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              No cards requested yet.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-5 xl:grid-cols-7">
              {requestedCards.map(
                (item) => (
                  <SelectedCardTile
                    key={
                      item.tradeItem.id
                    }
                    item={item}
                    tradeId={trade.id}
                    removable={
                      editable
                    }
                  />
                )
              )}
            </div>
          )}
        </div>
      </section>

      {/* DRAFT SEND */}

      {trade.status ===
        "draft" &&
        isSender && (
          <section className="panel mt-4 p-5">
            <div className="flex items-start gap-3">
              <Send
                size={20}
                className="mt-0.5 shrink-0 text-amber-300"
              />

              <div className="flex-1">
                <p className="font-black">
                  Send Trade Offer
                </p>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Je moet minimaal één kaart aanbieden. Requested cards zijn optioneel.
                  Zodra je verstuurt worden alle geselecteerde kaarten gelockt.
                </p>

                <form
                  action={submitTrade}
                  className="mt-4"
                >
                  <input
                    type="hidden"
                    name="trade_id"
                    value={trade.id}
                  />

                  <textarea
                    name="message"
                    rows={3}
                    maxLength={1000}
                    placeholder="Optional message..."
                    className="field resize-y"
                  />

                  <SubmitButton
                    disabled={
                      offeredCards.length === 0
                    }
                    pendingLabel="Sending..."
                    className="primary-button mt-3 inline-flex cursor-pointer items-center justify-center gap-2 transition-all hover:-translate-y-0.5 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send size={16} />
                    Send Trade
                  </SubmitButton>
                </form>
              </div>
            </div>
          </section>
        )}

      {/* PENDING RECEIVER */}

      {trade.status ===
        "pending" &&
        isReceiver && (
          <section className="panel mt-4 p-5">
            <p className="text-xs font-black tracking-[.2em] text-amber-300">
              INCOMING OFFER
            </p>

            <h2 className="mt-2 text-2xl font-black">
              Accept this trade?
            </h2>

            {trade.message && (
              <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Message
                </p>

                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-300">
                  {trade.message}
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <form
                action={acceptTrade}
              >
                <input
                  type="hidden"
                  name="trade_id"
                  value={trade.id}
                />

                <SubmitButton
                  pendingLabel="Accepting..."
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-black text-emerald-200 transition-all hover:-translate-y-0.5 hover:bg-emerald-400/20 active:scale-[0.97]"
                >
                  <CheckCircle2
                    size={16}
                  />
                  Accept Trade
                </SubmitButton>
              </form>

              <form
                action={declineTrade}
              >
                <input
                  type="hidden"
                  name="trade_id"
                  value={trade.id}
                />

                <ConfirmSubmitButton
                  confirmMessage="Decline this trade offer?"
                  pendingLabel="Declining..."
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm font-black text-red-200 transition-all hover:-translate-y-0.5 hover:bg-red-400/20 active:scale-[0.97]"
                >
                  <XCircle size={16} />
                  Decline
                </ConfirmSubmitButton>
              </form>
            </div>
          </section>
        )}

      {/* PENDING SENDER */}

      {trade.status ===
        "pending" &&
        isSender && (
          <section className="panel mt-4 p-5">
            <div className="flex items-start gap-3">
              <Clock3
                size={20}
                className="mt-0.5 text-amber-300"
              />

              <div>
                <p className="font-black">
                  Waiting for response
                </p>

                <p className="mt-2 text-sm text-zinc-500">
                  {playerName(receiver)} has not accepted or declined this trade yet.
                </p>

                <form
                  action={cancelTrade}
                  className="mt-4"
                >
                  <input
                    type="hidden"
                    name="trade_id"
                    value={trade.id}
                  />

                  <ConfirmSubmitButton
                    confirmMessage="Cancel this trade?"
                    pendingLabel="Cancelling..."
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-2.5 text-sm font-black text-red-200 transition-all hover:-translate-y-0.5 hover:bg-red-400/20 active:scale-[0.97]"
                  >
                    <XCircle size={16} />
                    Cancel Trade
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          </section>
        )}

      {/* FINAL */}

      {trade.status ===
        "accepted" && (
          <section className="panel mt-4 p-6 text-center">
            <CheckCircle2
              size={42}
              className="mx-auto text-emerald-300"
            />

            <h2 className="mt-4 text-2xl font-black text-emerald-200">
              Trade Completed
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Ownership of all selected physical card copies has been transferred.
            </p>
          </section>
        )}

      {(trade.status ===
        "declined" ||
        trade.status ===
          "cancelled") && (
        <section className="panel mt-4 p-6 text-center">
          <XCircle
            size={40}
            className="mx-auto text-zinc-500"
          />

          <h2 className="mt-4 text-2xl font-black">
            {trade.status ===
            "declined"
              ? "Trade Declined"
              : "Trade Cancelled"}
          </h2>

          <p className="mt-2 text-sm text-zinc-500">
            All temporary trade locks have been removed.
          </p>
        </section>
      )}

      {/* COLLECTIONS */}

      {editable && (
        <section className="mt-8 grid gap-8 xl:grid-cols-2">
          <div>
            <p className="text-xs font-black tracking-[.2em] text-amber-300">
              YOUR COLLECTION
            </p>

            <h2 className="mt-1 text-2xl font-black">
              Cards You Offer
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Choose physical copies from your Collection.
            </p>

            <TradeCollectionBrowser
              tradeId={trade.id}
              cards={senderBrowserCards}
              side="offered"
              title="Your Collection"
            />
          </div>

          <div>
            <p className="text-xs font-black tracking-[.2em] text-cyan-300">
              {playerName(
                receiver
              ).toUpperCase()}
              &apos;S COLLECTION
            </p>

            <h2 className="mt-1 text-2xl font-black">
              Cards You Request
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Select physical copies you want to receive.
            </p>

            <TradeCollectionBrowser
              tradeId={trade.id}
              cards={receiverBrowserCards}
              side="requested"
              title={`${playerName(
                receiver
              )}'s Collection`}
            />
          </div>
        </section>
      )}

      {!editable &&
        trade.status ===
          "pending" && (
          <section className="panel mt-8 p-5">
            <div className="flex items-start gap-3">
              <LockKeyhole
                size={20}
                className="mt-0.5 shrink-0 text-zinc-500"
              />

              <div>
                <p className="font-black">
                  Trade locked
                </p>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  This offer has already been sent. Its card selection can no longer be changed.
                </p>
              </div>
            </div>
          </section>
        )}
    </main>
  );
}