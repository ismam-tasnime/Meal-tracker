"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  addDaysToDateStr,
  formatDayOfWeek,
  formatDisplayDate,
  isTodayInOfficeTz,
  todayInOfficeTz,
} from "@/lib/utils/date";

export function DateNav({ date, basePath = "/" }: { date: string; basePath?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function goTo(nextDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", nextDate);
    startTransition(() => {
      router.push(`${basePath}?${params.toString()}`);
    });
  }

  const isToday = isTodayInOfficeTz(date);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(addDaysToDateStr(date, -1))}
          className="flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-100"
          aria-label="Previous day"
        >
          ← Prev
        </button>

        <div className="flex flex-1 flex-col items-center px-1 text-center">
          <span className="text-base font-semibold leading-tight">
            {formatDisplayDate(date)}
          </span>
          <span className="text-xs text-slate-500">
            {formatDayOfWeek(date)}
            {isToday && (
              <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                Today
              </span>
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={() => goTo(addDaysToDateStr(date, 1))}
          className="flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-100"
          aria-label="Next day"
        >
          Next →
        </button>
      </div>

      <div className="flex items-center justify-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && goTo(e.target.value)}
          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
          aria-label="Pick a date"
        />
        {!isToday && (
          <button
            type="button"
            onClick={() => goTo(todayInOfficeTz())}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 active:bg-slate-100"
          >
            Jump to today
          </button>
        )}
        {isPending && <span className="text-xs text-slate-400">Loading…</span>}
      </div>
    </div>
  );
}
