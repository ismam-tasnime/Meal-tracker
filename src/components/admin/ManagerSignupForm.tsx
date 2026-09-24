"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signUpMessManager } from "@/lib/actions/auth";
import { MessMonthPicker, type MessMonth } from "@/components/admin/MessMonthPicker";

export function ManagerSignupForm({ defaultMonth }: { defaultMonth: MessMonth }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [messMonth, setMessMonth] = useState(defaultMonth);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const result = await signUpMessManager({
        email,
        password,
        fullName,
        year: messMonth.year,
        month: messMonth.month,
      });

      if (!result.ok) {
        setError(result.error);
        setAccountCreated(!!result.accountCreated);
        return;
      }

      if (result.needsEmailConfirmation) {
        setConfirmationSent(true);
        return;
      }

      router.replace("/admin");
      router.refresh();
    });
  }

  if (accountCreated) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
          Your account was created, but: {error}
        </p>
        <Link
          href="/admin"
          className="flex h-11 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          Pick another month
        </Link>
      </div>
    );
  }

  if (confirmationSent) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
          Account created. Check <strong>{email}</strong> for a confirmation link.
        </p>
        <p className="text-slate-600">
          After confirming, sign in and pick your mess month again to open your dashboard.
        </p>
        <Link
          href="/admin/login"
          className="flex h-11 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="fullName" className="text-sm font-medium text-slate-700">
          Your name
        </label>
        <input
          id="fullName"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
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
          className="h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
          className="h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <MessMonthPicker value={messMonth} onChange={setMessMonth} />

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-11 rounded-full bg-indigo-600 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 transition-colors active:bg-indigo-700 disabled:opacity-60"
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
