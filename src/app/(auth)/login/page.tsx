import { AuthForm } from "@/components/auth-form";
import { login } from "@/app/actions/auth";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-10">
      <section className="w-full">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid size-20 place-items-center rounded-3xl border border-amber-300/25 bg-amber-300/5 text-3xl">✦</div>
          <p className="text-xs font-bold tracking-[.35em] text-amber-300">PRIVATE LEAGUE</p>
          <h1 className="gold-text mt-2 text-4xl font-black">Duelist Circle</h1>
          <p className="mt-3 text-sm text-zinc-400">Cards are earned. Rivalries are permanent.</p>
        </div>
        <div className="panel p-5"><AuthForm action={login} mode="login" /></div>
      </section>
    </main>
  );
}
