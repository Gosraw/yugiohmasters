export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <section className="panel w-full p-6 text-center">
        <p className="text-xs font-bold tracking-[.3em] text-amber-300">OFFLINE</p>
        <h1 className="mt-3 text-3xl font-black">The arena is disconnected.</h1>
        <p className="mt-3 text-zinc-400">Reconnect to sync league data safely.</p>
        {/* Plain link, no JavaScript needed: offline it shows this page again, online it opens the app. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load is the point here */}
        <a href="/" className="primary-button mt-6 inline-flex px-5 py-2.5 text-sm">Try again</a>
      </section>
    </main>
  );
}
