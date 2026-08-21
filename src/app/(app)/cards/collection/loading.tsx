// =========================================================
// COLLECTION LOADING SKELETON
//
// Overrides the generic (app)/loading.tsx spinner with a shape
// that already looks like the Collection page - stat tiles and a
// card grid - so the layout doesn't jump once real data arrives.
// =========================================================

export default function CollectionLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="relative mx-auto max-w-7xl animate-pulse px-4 py-6 sm:px-6 lg:px-8">
        <div className="h-10 w-40 rounded-xl bg-white/[0.04]" />

        <div className="mt-6 h-40 rounded-[28px] bg-white/[0.04]" />

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-white/[0.035]"
            />
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[421/614] rounded-2xl bg-white/[0.035]"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
