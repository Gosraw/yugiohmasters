"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthActionState } from "@/app/actions/auth";

type Action = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;

export function AuthForm({
  action,
  mode,
}: {
  action: Action;
  mode: "login" | "signup";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const signup = mode === "signup";

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm text-zinc-300">Username</span>
        <input name="username" autoComplete="username" required minLength={3} maxLength={24}
          className="field" placeholder="duelist_name" />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm text-zinc-300">Password</span>
        <input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"}
          required minLength={8} className="field" placeholder="••••••••" />
      </label>
      {state.error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{state.error}</p>}
      <button disabled={pending} className="primary-button w-full">
        {pending ? "Bezig..." : signup ? "Create account" : "Enter the arena"}
      </button>
      <p className="text-center text-sm text-zinc-400">
        {signup ? "Al een account?" : "Nieuw hier?"}{" "}
        <Link className="text-amber-300 hover:text-amber-200" href={signup ? "/login" : "/signup"}>
          {signup ? "Login" : "Create account"}
        </Link>
      </p>
    </form>
  );
}
