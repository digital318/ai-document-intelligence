"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BrainCircuit } from "lucide-react";
import { signIn, type AuthActionResult } from "@/app/auth/actions";

const CONFIRMATION_ERROR_MESSAGE =
  "Email confirmation failed. Please try signing in or request a new confirmation email.";

type LoginFormProps = {
  confirmationError?: boolean;
};

export function LoginForm({ confirmationError = false }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(
    async (
      _prev: AuthActionResult | null,
      formData: FormData,
    ): Promise<AuthActionResult | null> => signIn(formData),
    null,
  );

  const errorMessage =
    state?.error ?? (confirmationError ? CONFIRMATION_ERROR_MESSAGE : null);

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 flex flex-col items-center text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <BrainCircuit className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Access your AI Document Intelligence workspace
        </p>
      </div>

      <form
        action={formAction}
        className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8"
        noValidate
      >
        {errorMessage ? (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pending}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              disabled={pending}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
              placeholder="At least 8 characters"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-6 flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            Create account
          </Link>
        </p>
      </form>
    </div>
  );
}
