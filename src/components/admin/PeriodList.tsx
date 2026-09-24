"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deletePeriod } from "@/lib/actions/periods";
import type { MessPeriod } from "@/lib/types/database";
import { todayInOfficeTz } from "@/lib/utils/date";
import { formatPeriodName, formatPeriodRange, isDateInPeriod } from "@/lib/utils/mess";

export function PeriodList({ periods }: { periods: MessPeriod[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const today = todayInOfficeTz();

  function remove(period: MessPeriod) {
    if (
      !confirm(
        `Remove ${formatPeriodName(period)}? Its prices are deleted too. Meal records stay — they belong to the office.`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deletePeriod(period.id);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {periods.map((period) => (
            <li key={period.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                  {formatPeriodName(period)}
                  {isDateInPeriod(today, period) && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      Running now
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{formatPeriodRange(period)}</p>
              </div>
              <button
                onClick={() => remove(period)}
                disabled={isPending}
                className="h-8 rounded-full border border-red-200 px-2.5 text-xs font-medium text-red-600 disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
