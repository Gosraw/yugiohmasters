"use client";

import {
  useRef,
  useState,
} from "react";

import {
  Crown,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";

type ChatMessage = {
  role: "player" | "boss";
  text: string;
  source?: "ai" | "fallback";
};

const QUICK_PROMPTS = [
  "What should I do now?",
  "How is my league going?",
  "Who is my biggest rival?",
  "How's my deck looking?",
  "What did I recently get?",
];

export function BossCompanionChat({
  bossName,
}: {
  bossName: string | null;
}) {
  const [open, setOpen] =
    useState(false);

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [input, setInput] =
    useState("");

  const [pending, setPending] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const scrollRef =
    useRef<HTMLDivElement>(null);

  const displayName =
    bossName ?? "Your Boss Monster";

  async function ask(
    question: string
  ) {
    const trimmed =
      question.trim();

    if (!trimmed || pending) return;

    setError(null);

    setMessages((prev) => [
      ...prev,
      {
        role: "player",
        text: trimmed,
      },
    ]);

    setInput("");
    setPending(true);

    try {
      const response = await fetch(
        "/api/boss-companion",
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
          },
          body: JSON.stringify({
            question: trimmed,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data?.error ??
            "Something went wrong."
        );
        setPending(false);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "boss",
          text: data.message,
          source: data.source,
        },
      ]);
    } catch {
      setError(
        "Couldn't reach your Boss Monster right now. Try again in a moment."
      );
    } finally {
      setPending(false);

      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() =>
          setOpen(true)
        }
        className="energy-line group mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[0.05] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-violet-200 transition-all hover:-translate-y-0.5 hover:border-violet-300/40 hover:bg-violet-300/10 active:scale-[0.97]"
      >
        <Sparkles size={14} />
        Ask {displayName}
      </button>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-violet-300/20 bg-black/70 backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Crown
            size={14}
            className="text-amber-300"
          />
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">
            {displayName}
          </span>
        </div>

        <button
          type="button"
          onClick={() =>
            setOpen(false)
          }
          className="cursor-pointer rounded-lg px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-500 transition hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      <div
        ref={scrollRef}
        className="max-h-64 min-h-[64px] space-y-2 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 && (
          <p className="text-xs leading-5 text-zinc-500">
            Ask about your next move, your league standing, your rival, your deck, or recent pulls.
          </p>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "player"
                ? "ml-auto max-w-[85%] rounded-lg rounded-br-sm border border-white/10 bg-white/[0.05] px-3 py-2 text-xs leading-5 text-zinc-200"
                : "mr-auto max-w-[85%] rounded-lg rounded-bl-sm border border-violet-300/15 bg-violet-300/[0.05] px-3 py-2 text-xs leading-5 text-violet-100"
            }
          >
            {message.text}
          </div>
        ))}

        {pending && (
          <div className="mr-auto flex max-w-[85%] items-center gap-2 rounded-lg rounded-bl-sm border border-violet-300/15 bg-violet-300/[0.05] px-3 py-2 text-xs text-violet-200/70">
            <Loader2
              size={12}
              className="animate-spin"
            />
            thinking...
          </div>
        )}
      </div>

      {error && (
        <p className="px-3 pb-1 text-[10px] font-bold text-red-300">
          {error}
        </p>
      )}

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() =>
                ask(prompt)
              }
              disabled={pending}
              className="cursor-pointer rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[9px] font-bold text-zinc-400 transition hover:border-violet-300/30 hover:text-violet-200 disabled:cursor-wait disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className="flex items-center gap-2 border-t border-white/10 p-2"
      >
        <input
          type="text"
          value={input}
          onChange={(event) =>
            setInput(
              event.target.value
            )
          }
          disabled={pending}
          placeholder="Ask your Boss Monster..."
          maxLength={500}
          className="field flex-1 py-2 text-xs"
        />

        <button
          type="submit"
          disabled={
            pending ||
            !input.trim()
          }
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-violet-300/25 bg-violet-300/10 text-violet-200 transition hover:bg-violet-300/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
