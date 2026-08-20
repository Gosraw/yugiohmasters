import { AuthForm } from "@/components/auth-form";
import { signup } from "@/app/actions/auth";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-10">
      <section className="w-full">
        <p className="text-xs font-bold tracking-[.35em] text-amber-300">NEW DUELIST</p>
        <h1 className="gold-text mt-2 text-4xl font-black">Start from zero.</h1>
        <p className="mb-7 mt-3 text-sm leading-6 text-zinc-400">Geen gratis kaarten. Geen gratis decks. Alles wat je later bezit, heb je verdiend.</p>
        <div className="panel p-5"><AuthForm action={signup} mode="signup" /></div>
      </section>
    </main>
  );
}
