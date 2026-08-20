import Link from "next/link";
import { chooseBossMonster } from "@/app/actions/profile";
import { requireUser } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { supabase, userId } = await requireUser();
  const { error: leagueError } = await supabase.rpc("bootstrap_private_league");
  if (leagueError) {
    return <main className="mx-auto max-w-xl p-6"><section className="panel p-6"><h1 className="text-2xl font-black">League unavailable</h1><p className="mt-2 text-zinc-400">De privéleague is vol of kon niet worden geïnitialiseerd.</p></section></main>;
  }
  const { data: profile } = await supabase.from("profiles").select("boss_monster_option_id").eq("id", userId).single();
  if (profile?.boss_monster_option_id) {
  return <main className="p-6">Boss Monster is al gekozen. <Link href="/" className="text-amber-300">Ga naar home.</Link></main>;
  }

  const { data: bosses } = await supabase
    .from("boss_monster_options")
    .select("id,name,subtitle")
    .eq("active", true)
    .order("sort_order");

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <p className="text-xs font-bold tracking-[.3em] text-amber-300">ONBOARDING</p>
      <h1 className="gold-text mt-2 text-3xl font-black">Choose your Boss Monster</h1>
      <p className="mt-2 text-sm text-zinc-400">Alleen identiteit in V1. Deze keuze voegt de kaart niet toe aan je collection.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {bosses?.map((boss) => (
          <form action={chooseBossMonster} key={boss.id}>
            <input type="hidden" name="boss_monster_option_id" value={boss.id} />
            <button className="panel flex min-h-36 w-full flex-col justify-end p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-300/30">
              <span className="text-2xl">◈</span>
              <strong className="mt-5 leading-tight">{boss.name}</strong>
              <span className="mt-1 text-xs text-zinc-500">{boss.subtitle}</span>
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
