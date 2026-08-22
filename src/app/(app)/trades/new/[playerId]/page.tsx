import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  Home,
  Repeat2,
  UserRound,
} from "lucide-react";

import {
  createTrade,
} from "@/app/actions/trades";

import {
  requireUser,
} from "@/lib/supabase/queries";

import {
  SubmitButton,
} from "@/components/submit-button";

export const dynamic =
  "force-dynamic";

type Profile = {
  id: string;
  username:
    | string
    | null;
  duelist_name:
    | string
    | null;
};

function playerName(
  profile: Profile
) {
  return (
    profile.duelist_name ??
    profile.username ??
    "Unknown Player"
  );
}

export default async function NewTradeWithPlayerPage({
  params,
}: {
  params: Promise<{
    playerId: string;
  }>;
}) {
  const {
    playerId,
  } = await params;

  const {
    supabase,
    userId,
  } = await requireUser();

  if (
    playerId ===
    userId
  ) {
    notFound();
  }

  // ======================================================
  // CURRENT LEAGUE
  // ======================================================

  const {
    data: membership,
    error:
      membershipError,
  } = await supabase
    .from("league_members")
    .select("league_id")
    .eq(
      "profile_id",
      userId
    )
    .limit(1)
    .maybeSingle();

  if (
    membershipError ||
    !membership
  ) {
    notFound();
  }

  // ======================================================
  // TARGET PLAYER MUST BE IN SAME LEAGUE
  // ======================================================

  const {
    data:
      targetMembership,
    error:
      targetMembershipError,
  } = await supabase
    .from("league_members")
    .select("profile_id")
    .eq(
      "league_id",
      membership.league_id
    )
    .eq(
      "profile_id",
      playerId
    )
    .maybeSingle();

  if (
    targetMembershipError ||
    !targetMembership
  ) {
    notFound();
  }

  // ======================================================
  // PROFILE
  // ======================================================

  const {
    data: profileData,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      "id,username,duelist_name"
    )
    .eq(
      "id",
      playerId
    )
    .maybeSingle();

  if (
    profileError ||
    !profileData
  ) {
    notFound();
  }

  const profile =
    profileData as Profile;

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {/* NAVIGATION */}

      <nav className="flex flex-wrap items-center gap-3">
        <Link
          href="/trades/new"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:-translate-x-0.5 hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-200 active:scale-95"
        >
          <ArrowLeft
            size={17}
          />
          Back
        </Link>

        <Link
          href="/"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100 active:scale-95"
        >
          <Home
            size={16}
          />
          Home
        </Link>
      </nav>

      {/* HEADER */}

      <header className="mt-6">
        <p className="text-xs font-black tracking-[.28em] text-amber-300">
          START TRADE
        </p>

        <h1 className="gold-text mt-2 text-4xl font-black">
          Trade with{" "}
          {playerName(
            profile
          )}
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Start een draft trade. Daarna kun je jouw kaarten aanbieden en kaarten van deze speler aanvragen.
        </p>
      </header>

      {/* PLAYER */}

      <section className="panel mt-6 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10">
            <UserRound
              size={22}
              className="text-amber-300"
            />
          </div>

          <div>
            <p className="text-xl font-black text-zinc-100">
              {playerName(
                profile
              )}
            </p>

            {profile.username && (
              <p className="mt-1 text-sm text-zinc-500">
                @{profile.username}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* EXPLANATION */}

      <section className="panel mt-4 p-6">
        <div className="flex items-start gap-3">
          <Repeat2
            size={22}
            className="mt-0.5 shrink-0 text-cyan-300"
          />

          <div>
            <p className="font-black text-zinc-200">
              What happens next?
            </p>

            <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-500">
              <p>
                Je trade wordt eerst als Draft aangemaakt.
              </p>

              <p>
                Daarna kies je fysieke kaarten uit jouw Collection die je aanbiedt.
              </p>

              <p>
                Je kunt ook fysieke kaarten uit de Collection van {playerName(profile)} selecteren die je wilt ontvangen.
              </p>

              <p>
                Er wordt niets gereserveerd door alleen te versturen - dezelfde kaart mag in meerdere trades tegelijk zitten. Pas bij Accept wordt live gecontroleerd of de kaarten nog echt van de juiste speler zijn.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* START */}

      <section className="mt-6">
        <form
          action={
            createTrade
          }
        >
          <input
            type="hidden"
            name="receiver_id"
            value={
              profile.id
            }
          />

          <SubmitButton
            pendingLabel="Starting..."
            className="primary-button inline-flex cursor-pointer items-center justify-center gap-2 transition-all hover:-translate-y-0.5 active:scale-[0.97]"
          >
            <Repeat2
              size={17}
            />

            Start Trade
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}