"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signUpMessManager } from "@/lib/actions/auth";
import { formatPeriodRange, messMonthRange, parseMessMonthName } from "@/lib/utils/mess";

const INPUT_CLASS =
  "h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function ManagerSignupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const messMonth = parseMessMonthName(username);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const result = await signUpMessManager(username, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/admin");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-sm font-medium text-slate-700">
          Account name (month + year)
        </label>
        <input
          id="username"
          type="text"
          required
          autoComplete="username"
          placeholder="January2026"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={INPUT_CLASS}
        />
        <p className="text-xs text-slate-400">
          {messMonth
            ? `Covers ${formatPeriodRange(messMonthRange(messMonth))}.`
            : "Month and year, like January2026. Each month can have only one account — share it with your team."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT_CLASS}
        />
        <p className="text-xs text-slate-400">At least 8 characters.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
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
        {isPending ? "Creating account…" : "Create mess manager account"}
      </button>

      <p className="text-center text-xs text-slate-500">
        Already have an account?{" "}
        <Link href="/admin/login" className="text-indigo-600">
          Sign in
        </Link>
      </p>
    </form>
  );
}
