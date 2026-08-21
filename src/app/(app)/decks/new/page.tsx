import Link from "next/link";
import {
  ArrowLeft,
  Layers3,
  Plus,
} from "lucide-react";

import { createDeck } from "@/app/actions/decks";
import { SubmitButton } from "@/components/submit-button";

export default function NewDeckPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/decks"
        className="inline-flex items-center gap-2 text-sm font-bold text-amber-300 transition hover:text-amber-200"
      >
        <ArrowLeft size={17} />
        Back to decks
      </Link>

      <header className="mt-7">
        <p className="text-xs font-black tracking-[.28em] text-amber-300">
          DECK BUILDER
        </p>

        <h1 className="gold-text mt-2 text-4xl font-black">
          Create Deck
        </h1>

        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
          Geef je deck een naam. Daarna kun je kaarten uit je eigen
          Collection toevoegen.
        </p>
      </header>

      <section className="panel mt-6 p-6 sm:p-8">
        <Layers3
          size={36}
          className="text-amber-300"
        />

        <form
          action={createDeck}
          className="mt-6"
        >
          <label className="block">
            <span className="text-sm font-black text-zinc-200">
              Deck name
            </span>

            <input
              type="text"
              name="name"
              required
              maxLength={80}
              placeholder="Bijv. Dark Magician Control"
              className="field mt-2"
            />
          </label>

          <div className="mt-6 rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <p className="text-sm font-black text-zinc-200">
              Deck rules
            </p>

            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Main Deck: 40–60 kaarten. Extra Deck: maximaal 15 kaarten
              en alleen Fusion + XYZ Monsters.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <SubmitButton
              pendingLabel="Creating..."
              className="primary-button inline-flex items-center justify-center gap-2"
            >
              <Plus size={17} />
              Create Deck
            </SubmitButton>

            <Link
              href="/decks"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}