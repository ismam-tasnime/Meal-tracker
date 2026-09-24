"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPeriod } from "@/lib/actions/periods";
import { MessMonthPicker, type MessMonth } from "@/components/admin/MessMonthPicker";

export function NewPeriodForm({
  defaultMonth,
  submitLabel = "Add month",
}: {
  defaultMonth: MessMonth;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [messMonth, setMessMonth] = useState(defaultMonth);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createPeriod(messMonth.year, messMonth.month);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"
    >
      <MessMonthPicker id="newPeriodMonth" value={messMonth} onChange={setMessMonth} />

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-10 w-fit rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
      >
        {isPending ? "Adding…" : submitLabel}
      </button>
    </form>
  );
}
