// =========================================================
// SHOP LOADING SKELETON
// =========================================================

export default function ShopLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="relative mx-auto max-w-6xl animate-pulse px-4 py-6 sm:px-6 lg:px-8">
        <div className="h-10 w-32 rounded-xl bg-white/[0.04]" />

        <div className="mt-6 h-48 rounded-[28px] bg-white/[0.04]" />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-64 rounded-2xl bg-white/[0.035]"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
