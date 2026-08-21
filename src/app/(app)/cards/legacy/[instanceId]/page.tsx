import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  Award,
  Crown,
  Gift,
  Hash,
  Repeat2,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Swords,
  Wrench,
} from "lucide-react";

import {
  notFound,
} from "next/navigation";

import {
  requireUser,
} from "@/lib/supabase/queries";

export const dynamic =
  "force-dynamic";

// =========================================================
// TYPES
// =========================================================

type CardInstance = {
  id: string;
  league_id: string;
  card_catalog_id: string;
  copy_number: number;
  current_owner_id: string;
  original_owner_id: string;

  original_acquisition_type:
    | "draft"
    | "shop"
    | "trade"
    | "tournament"
    | "achievement"
    | "reward"
    | "wager"
    | "admin"
    | "development"
    | "other";

  acquired_at: string;
  locked: boolean;
  lock_type: string | null;
};

type CardCatalog = {
  id: string;
  name: string;
  image_url: string | null;
  game_rarity: string | null;
};

type HistoryEvent = {
  id: number;
  from_owner_id: string | null;
  to_owner_id: string | null;
  event_type: string;
  created_at: string;
};

type Profile = {
  id: string;
  username: string | null;
  duelist_name: string;
};

// =========================================================
// ACQUISITION LABELS
//
// Everything here is derived from data the app already knows
// with certainty. Nothing is guessed. If we cannot be sure how
// a later ownership change happened (trade vs. wager), it is
// shown as a generic "Ownership transferred" instead of a
// possibly-wrong reason.
// =========================================================

const ACQUISITION_LABEL: Record<
  string,
  { label: string; description: string; icon: typeof Sparkles }
> = {
  draft: {
    label: "Drafted",
    description:
      "Drafted by the original owner during the initial league draft.",
    icon: Swords,
  },
  shop: {
    label: "Pack Pull",
    description: "Pulled from a Shop Pack.",
    icon: Gift,
  },
  trade: {
    label: "Traded",
    description: "This copy entered the league through a trade.",
    icon: Repeat2,
  },
  tournament: {
    label: "Tournament Reward",
    description: "Awarded from a tournament.",
    icon: Award,
  },
  achievement: {
    label: "Achievement Reward",
    description: "Awarded for unlocking an achievement.",
    icon: Award,
  },
  reward: {
    label: "League Reward",
    description: "Granted as a league reward.",
    icon: Gift,
  },
  wager: {
    label: "Wagered",
    description: "Won in a Practice Duel wager.",
    icon: Swords,
  },
  admin: {
    label: "Admin Grant",
    description: "Added to the league by an admin.",
    icon: ShieldCheck,
  },
  development: {
    label: "Development",
    description: "Added during app development.",
    icon: Wrench,
  },
  other: {
    label: "Acquired",
    description: "Acquired by the original owner.",
    icon: Sparkles,
  },
};

// =========================================================
// HELPERS
// =========================================================

function playerName(profile: Profile | undefined) {
  return profile?.duelist_name ?? profile?.username ?? "Unknown Duelist";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// =========================================================
// PAGE
// =========================================================

export default async function CardLegacyPage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;

  const { supabase } = await requireUser();

  // RLS already scopes card_instances / ownership_history to
  // members of the card's own league, so a non-member simply
  // gets no row back here - no extra membership check needed.

  const { data: instanceData, error: instanceError } = await supabase
    .from("card_instances")
    .select(
      `
        id,
        league_id,
        card_catalog_id,
        copy_number,
        current_owner_id,
        original_owner_id,
        original_acquisition_type,
        acquired_at,
        locked,
        lock_type
      `
    )
    .eq("id", instanceId)
    .maybeSingle();

  if (instanceError || !instanceData) {
    notFound();
  }

  const instance = instanceData as CardInstance;

  const [
    { data: catalogData, error: catalogError },
    { data: historyData, error: historyError },
    { count: totalCopies },
  ] = await Promise.all([
    supabase
      .from("card_catalog")
      .select("id,name,image_url,game_rarity")
      .eq("id", instance.card_catalog_id)
      .maybeSingle(),
    supabase
      .from("ownership_history")
      .select("id,from_owner_id,to_owner_id,event_type,created_at")
      .eq("card_instance_id", instance.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("card_instances")
      .select("id", { count: "exact", head: true })
      .eq("card_catalog_id", instance.card_catalog_id)
      .eq("league_id", instance.league_id),
  ]);

  if (catalogError || !catalogData) {
    notFound();
  }

  if (historyError) {
    throw new Error(historyError.message);
  }

  const catalog = catalogData as CardCatalog;
  const history = (historyData ?? []) as HistoryEvent[];

  const transferEvents = history.filter(
    (event) => event.event_type === "ownership_transfer"
  );

  const ownerIds = new Set<string>();
  ownerIds.add(instance.original_owner_id);
  ownerIds.add(instance.current_owner_id);
  for (const event of history) {
    if (event.from_owner_id) ownerIds.add(event.from_owner_id);
    if (event.to_owner_id) ownerIds.add(event.to_owner_id);
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,username,duelist_name")
    .in("id", [...ownerIds]);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profileMap = new Map(
    ((profileData ?? []) as Profile[]).map((profile) => [profile.id, profile])
  );

  // =======================================================
  // LABELS
  // =======================================================

  const acquisition =
    ACQUISITION_LABEL[instance.original_acquisition_type] ??
    ACQUISITION_LABEL.other;

  const AcquisitionIcon = acquisition.icon;

  const isOriginalOwner =
    instance.current_owner_id === instance.original_owner_id;

  const isFoundingCopy = instance.copy_number === 1;

  const isWellTraveled = transferEvents.length >= 3;

  const badges: {
    label: string;
    tone: string;
    icon: typeof Crown;
  }[] = [];

  if (isFoundingCopy) {
    badges.push({
      label: "Founding Copy",
      tone: "border-amber-300/30 bg-amber-300/10 text-amber-200",
      icon: Crown,
    });
  }

  if (isOriginalOwner) {
    badges.push({
      label: "Original Owner",
      tone: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
      icon: ShieldCheck,
    });
  }

  if (isWellTraveled) {
    badges.push({
      label: "Well Traveled",
      tone: "border-violet-300/30 bg-violet-300/10 text-violet-200",
      icon: Repeat2,
    });
  }

  // =======================================================
  // UI
  // =======================================================

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-amber-400/[0.06] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Link
          href={`/cards/${instance.card_catalog_id}`}
          className="inline-flex cursor-pointer items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-500 transition-colors hover:text-amber-200"
        >
          <ArrowLeft size={14} />
          Back to Card
        </Link>

        <section className="panel relative mt-4 overflow-hidden p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {catalog.image_url && (
              <div className="relative mx-auto h-40 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 sm:mx-0">
                <Image
                  src={catalog.image_url}
                  alt={catalog.name}
                  fill
                  className="object-cover"
                />
              </div>
            )}

            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[9px] font-black uppercase tracking-[.18em] text-amber-200">
                <ScrollText size={11} />
                Card Legacy
              </div>

              <h1 className="gold-text mt-3 text-2xl font-black sm:text-3xl">
                {catalog.name}
              </h1>

              <p className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
                <Hash size={13} />
                Copy #{instance.copy_number}
                {totalCopies ? ` of ${totalCopies}` : ""}
                {catalog.game_rarity ? ` · ${catalog.game_rarity}` : ""}
              </p>

              {badges.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {badges.map((badge) => {
                    const Icon = badge.icon;
                    return (
                      <span
                        key={badge.label}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${badge.tone}`}
                      >
                        <Icon size={11} />
                        {badge.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* =================================================
            CURRENT STATE
        ================================================= */}

        <section className="panel mt-6 grid gap-4 p-6 sm:grid-cols-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Current Owner
            </p>
            <p className="mt-1 text-lg font-black text-zinc-100">
              {playerName(profileMap.get(instance.current_owner_id))}
            </p>
          </div>

          <div>
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Original Owner
            </p>
            <p className="mt-1 text-lg font-black text-zinc-100">
              {playerName(profileMap.get(instance.original_owner_id))}
            </p>
          </div>

          <div>
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Ownership Changes
            </p>
            <p className="mt-1 text-lg font-black text-zinc-100">
              {transferEvents.length}
            </p>
          </div>
        </section>

        {/* =================================================
            TIMELINE
        ================================================= */}

        <section className="panel mt-6 p-6">
          <h2 className="text-lg font-black text-zinc-200">
            Ownership Story
          </h2>

          <div className="mt-5 space-y-0">
            {/* origin event */}
            <div className="relative flex gap-4 pb-6">
              <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/10">
                  <AcquisitionIcon size={14} className="text-amber-300" />
                </div>
                {history.length > 0 && (
                  <div className="mt-1 w-px flex-1 bg-white/10" />
                )}
              </div>

              <div className="min-w-0 pb-2">
                <p className="text-sm font-black text-amber-200">
                  {acquisition.label}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  {playerName(profileMap.get(instance.original_owner_id))}{" "}
                  became the original owner.
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {formatDate(instance.acquired_at)} ·{" "}
                  {acquisition.description}
                </p>
              </div>
            </div>

            {/* transfer events */}
            {history.map((event, index) => {
              const isLast = index === history.length - 1;

              return (
                <div
                  key={event.id}
                  className="relative flex gap-4 pb-6 last:pb-0"
                >
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10">
                      <Repeat2 size={14} className="text-cyan-300" />
                    </div>
                    {!isLast && (
                      <div className="mt-1 w-px flex-1 bg-white/10" />
                    )}
                  </div>

                  <div className="min-w-0 pb-2">
                    <p className="text-sm font-black text-cyan-200">
                      Ownership Transferred
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {playerName(profileMap.get(event.from_owner_id ?? ""))}{" "}
                      → {playerName(profileMap.get(event.to_owner_id ?? ""))}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {formatDate(event.created_at)} · Exact reason (trade or
                      wager) is not tracked separately - shown here as a
                      transfer.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {instance.locked && instance.lock_type && (
          <section className="panel mt-6 border-red-300/15 bg-red-300/[0.02] p-5">
            <p className="text-sm font-black text-red-200">
              Currently locked: {instance.lock_type}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              This copy is temporarily reserved and cannot be traded or
              wagered right now.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
