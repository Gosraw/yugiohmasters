// =========================================================
// MATCHES LOADING SKELETON
// =========================================================

export default function MatchesLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="relative mx-auto max-w-6xl animate-pulse px-4 py-6 sm:px-6 lg:px-8">
        <div className="h-10 w-32 rounded-xl bg-white/[0.04]" />

        <div className="mt-6 h-40 rounded-[28px] bg-white/[0.04]" />

        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-white/[0.035]"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
