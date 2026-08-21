import Image from "next/image";
import Link from "next/link";

import {
  Crown,
  Sparkles,
} from "lucide-react";

import {
  chooseBossMonster,
} from "@/app/actions/profile";

import {
  requireUser,
} from "@/lib/supabase/queries";

export const dynamic =
  "force-dynamic";

export default async function OnboardingPage() {
  const {
    supabase,
    userId,
  } = await requireUser();

  const {
    error: leagueError,
  } = await supabase.rpc(
    "bootstrap_private_league"
  );

  if (leagueError) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <section className="panel p-6 text-center">
          <h1 className="text-2xl font-black">
            League unavailable
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            De privéleague is vol of kon niet worden geïnitialiseerd. Probeer het later opnieuw, of vraag de league owner om hulp.
          </p>
        </section>
      </main>
    );
  }

  const {
    data: profile,
  } = await supabase
    .from("profiles")
    .select(
      "boss_monster_option_id"
    )
    .eq(
      "id",
      userId
    )
    .single();

  if (
    profile?.boss_monster_option_id
  ) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <section className="panel p-6 text-center">
          <Crown
            size={28}
            className="mx-auto text-amber-300"
          />

          <h1 className="mt-4 text-2xl font-black">
            Boss Monster is al gekozen
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            Je hebt deze stap al afgerond.
          </p>

          <Link
            href="/"
            className="primary-button mt-5 inline-flex items-center justify-center"
          >
            Ga naar Home
          </Link>
        </section>
      </main>
    );
  }

  const {
    data: bosses,
  } = await supabase
    .from(
      "boss_monster_options"
    )
    .select(
      "id,name,subtitle,image_url"
    )
    .eq(
      "active",
      true
    )
    .order(
      "sort_order"
    );

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-amber-400/[0.06] blur-[150px]" />

        <div className="absolute -right-40 top-40 h-[480px] w-[480px] rounded-full bg-cyan-500/[0.05] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
          <Sparkles
            size={12}
          />
          Welcome to Duelist Circle
        </div>

        <h1 className="gold-text mt-4 text-3xl font-black sm:text-4xl">
          Choose your Boss Monster
        </h1>

        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">
          Dit is jouw identiteit in de league - een visitekaartje, geen echte kaart. Deze keuze voegt niets toe aan je Collection en kan later niet meer worden veranderd.
        </p>

        {!bosses ||
        bosses.length ===
          0 ? (
          <div className="panel mt-8 p-8 text-center text-sm text-zinc-500">
            Er zijn nog geen Boss Monsters beschikbaar. Vraag de league owner om er een aan te maken.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {bosses.map(
              (boss) => (
                <form
                  action={
                    chooseBossMonster
                  }
                  key={
                    boss.id
                  }
                >
                  <input
                    type="hidden"
                    name="boss_monster_option_id"
                    value={
                      boss.id
                    }
                  />

                  <button
                    type="submit"
                    className="panel group block w-full cursor-pointer overflow-hidden text-left transition-all duration-200 hover:-translate-y-1 hover:border-amber-300/30"
                  >
                    <div className="relative bg-black/20">
                      {boss.image_url ? (
                        <Image
                          src={
                            boss.image_url
                          }
                          alt={
                            boss.name
                          }
                          width={
                            421
                          }
                          height={
                            614
                          }
                          className="aspect-[421/614] h-auto w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          unoptimized
                        />
                      ) : (
                        <div className="flex aspect-[421/614] items-center justify-center text-3xl text-amber-300/40">
                          ◈
                        </div>
                      )}
                    </div>

                    <div className="p-3">
                      <p className="line-clamp-2 text-sm font-black leading-5 text-zinc-100 group-hover:text-amber-200">
                        {
                          boss.name
                        }
                      </p>

                      {boss.subtitle && (
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                          {
                            boss.subtitle
                          }
                        </p>
                      )}
                    </div>
                  </button>
                </form>
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}
