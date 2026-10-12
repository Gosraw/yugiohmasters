import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

// Shown (by src/lib/supabase/proxy.ts) to a signed-in account that
// could not join because the private league already has 3 players.
export default async function LeagueFullPage() {
  const { supabase, userId } = await requireUser();

  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  if (membership) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-10">
      <section className="panel w-full p-6 text-center">
        <Users size={30} className="mx-auto text-amber-300" />
        <p className="mt-4 text-xs font-bold tracking-[.3em] text-amber-300">LEAGUE FULL</p>
        <h1 className="gold-text mt-2 text-3xl font-black">This league is full.</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Duelist Circle is a private league for 3 players, and all seats are taken. Ask the league admin if a seat opens up.
        </p>
        <form action={logout} className="mt-6">
          <SubmitButton pendingLabel="Logging out..." className="primary-button w-full px-5 py-2.5 text-sm">
            Log out
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
