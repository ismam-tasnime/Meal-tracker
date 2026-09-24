"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { registerAsMessManager } from "@/lib/actions/auth";
import { MessMonthPicker, type MessMonth } from "@/components/admin/MessMonthPicker";

/** For a signed-in user who isn't a mess manager yet (e.g. after confirming their email). */
export function RegisterManagerForm({
  defaultName,
  defaultMonth,
}: {
  defaultName: string;
  defaultMonth: MessMonth;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(defaultName);
  const [messMonth, setMessMonth] = useState(defaultMonth);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await registerAsMessManager(fullName, messMonth.year, messMonth.month);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
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

      <MessMonthPicker value={messMonth} onChange={setMessMonth} />

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-11 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
      >
        {isPending ? "Setting up…" : "Become mess manager"}
      </button>
    </form>
  );
}
