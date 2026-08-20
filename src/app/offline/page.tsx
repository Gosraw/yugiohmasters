export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <section className="panel w-full p-6 text-center">
        <p className="text-xs font-bold tracking-[.3em] text-amber-300">OFFLINE</p>
        <h1 className="mt-3 text-3xl font-black">The arena is disconnected.</h1>
        <p className="mt-3 text-zinc-400">Reconnect om league-data veilig met Supabase te synchroniseren.</p>
      </section>
    </main>
  );
}
