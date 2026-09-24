"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { MessPeriod } from "@/lib/types/database";
import { formatPeriodName, formatPeriodRange } from "@/lib/utils/mess";

/** Switches between the signed-in manager's own mess months via the `period` search param. */
export function PeriodSelect({ periods, selectedId }: { periods: MessPeriod[]; selectedId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function select(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", id);
    // A date picked for one period rarely belongs to the next.
    params.delete("date");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="periodSelect" className="text-xs font-medium text-slate-500">
        Mess month
      </label>
      <div className="flex items-center gap-2">
        <select
          id="periodSelect"
          value={selectedId}
          onChange={(e) => select(e.target.value)}
          className="h-9 rounded-2xl border border-slate-300 bg-white px-2 text-sm"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {formatPeriodName(p)} ({formatPeriodRange(p)})
            </option>
          ))}
        </select>
        {isPending && <span className="text-xs text-slate-400">Loading…</span>}
      </div>
    </div>
  );
}
