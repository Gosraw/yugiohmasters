import { updateSetting } from "@/app/actions/admin";
import { requireUser } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase, userId } = await requireUser();
  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id,role")
    .eq("profile_id", userId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (!membership) return <main className="p-6">Unauthorized.</main>;

  const { data: settings } = await supabase
    .from("settings")
    .select("key,value")
    .eq("league_id", membership.league_id)
    .order("key");

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <p className="text-xs font-bold tracking-[.25em] text-amber-300">ADMIN MODE</p>
      <h1 className="gold-text mt-1 text-3xl font-black">League settings</h1>
      <p className="mt-2 text-sm text-zinc-400">Centrale configuratie. Geen gameplay-magic-numbers verspreid door de app.</p>
      <div className="mt-6 space-y-3">
        {settings?.map((setting) => (
          <form action={updateSetting} key={setting.key} className="panel p-4">
            <input type="hidden" name="key" value={setting.key} />
            <label className="text-sm font-bold">{setting.key}</label>
            <textarea name="value" className="field mt-2 min-h-20 font-mono text-xs" defaultValue={JSON.stringify(setting.value)} />
            <button className="primary-button mt-3 px-4 py-2 text-sm">Save</button>
          </form>
        ))}
      </div>
    </main>
  );
}
