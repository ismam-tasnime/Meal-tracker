"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { MONTH_NAMES } from "@/lib/utils/date";
import type { Employee } from "@/lib/types/database";

export function ReportFilters({
  year,
  month,
  employeeId,
  employees,
}: {
  year: number;
  month: number;
  employeeId: string;
  employees: Employee[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.push(`/admin/reports?${params.toString()}`);
    });
  }

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Month</label>
        <select
          value={month}
          onChange={(e) => updateParam("month", e.target.value)}
          className="h-9 rounded-2xl border border-slate-300 bg-white px-2 text-sm"
        >
          {MONTH_NAMES.map((name, idx) => (
            <option key={name} value={idx + 1}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Year</label>
        <select
          value={year}
          onChange={(e) => updateParam("year", e.target.value)}
          className="h-9 rounded-2xl border border-slate-300 bg-white px-2 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Employee</label>
        <select
          value={employeeId}
          onChange={(e) => updateParam("employee", e.target.value)}
          className="h-9 max-w-[10rem] rounded-2xl border border-slate-300 bg-white px-2 text-sm"
        >
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
