export default function Page() {
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <p className="text-xs font-bold tracking-[.25em] text-amber-300">PHASE 1</p>
      <h1 className="gold-text mt-1 text-3xl font-black">Play</h1>
      <div className="mt-5 space-y-3">
        {["Competition", "Challenges", "Tournament", "Life Points"].map((item) => (
          <div key={item} className="panel flex items-center justify-between p-4">
            <strong>{item}</strong><span className="text-xs uppercase tracking-wider text-zinc-600">Coming Soon</span>
          </div>
        ))}
      </div>
    </main>
  );
}
