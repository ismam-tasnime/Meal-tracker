"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function ReportFilters({
  employeeId,
  employees,
}: {
  employeeId: string;
  employees: { id: string; name: string }[];
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

  return (
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
  );
}
