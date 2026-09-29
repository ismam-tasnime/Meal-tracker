"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signInEmployee, signUpEmployee } from "@/lib/actions/employee-auth";

const INPUT_CLASS =
  "h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/** Employee sign-in and sign-up: Token Number + password. */
export function EmployeeAuthForm({ mode, next = "/employee" }: { mode: "login" | "signup"; next?: string }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSignup = mode === "signup";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSignup && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const result = isSignup
        ? await signUpEmployee(token, password)
        : await signInEmployee(token, password);
      if (result.ok) {
        // replace() fetches the page fresh; no extra refresh() needed.
        router.replace(next);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="token" className="text-sm font-semibold text-slate-700">
          Token Number
        </label>
        <input
          id="token"
          type="text"
          required
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="username"
          placeholder="12"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className={INPUT_CLASS}
        />
        {isSignup && (
          <p className="text-xs text-slate-400">
            The number the mess manager has on the employee list.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-semibold text-slate-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={isSignup ? 6 : undefined}
          autoComplete={isSignup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT_CLASS}
        />
        {isSignup && <p className="text-xs text-slate-400">At least 6 characters.</p>}
      </div>

      {isSignup && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirmPassword" className="text-sm font-semibold text-slate-700">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-11 rounded-full bg-indigo-600 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:bg-indigo-700 disabled:opacity-60"
      >
        {isSignup
          ? isPending ? "Creating account…" : "Create account"
          : isPending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-xs text-slate-500">
        {isSignup ? "Already have an account? " : "First time here? "}
        <Link
          href={isSignup ? "/employee/login" : "/employee/signup"}
          className="font-semibold text-indigo-600"
        >
          {isSignup ? "Sign in" : "Create your account"}
        </Link>
      </p>
    </form>
  );
}
