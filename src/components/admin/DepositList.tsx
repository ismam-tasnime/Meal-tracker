"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteDeposit } from "@/lib/actions/mess";
import type { DepositWithEmployee } from "@/lib/data/mess";
import { formatBDT } from "@/lib/utils/currency";
import { formatDisplayDate } from "@/lib/utils/date";
import { EmployeeName } from "@/components/EmployeeName";

export function DepositList({ deposits }: { deposits: DepositWithEmployee[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove(deposit: DepositWithEmployee) {
    if (!confirm(`Remove ${formatBDT(deposit.amount)} deposit from ${deposit.employee_name}?`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteDeposit(deposit.id);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  if (deposits.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
        No deposits recorded yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {deposits.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">
                <EmployeeName name={d.employee_name} tokenNo={d.token_no} />
              </p>
              <p className="truncate text-xs text-slate-500">
                {formatDisplayDate(d.deposited_on)}
                {d.note ? ` · ${d.note}` : ""}
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums text-slate-800">
              {formatBDT(d.amount)}
            </span>
            <button
              onClick={() => remove(d)}
              disabled={isPending}
              className="h-8 rounded-full border border-red-200 px-2.5 text-xs font-medium text-red-600 disabled:opacity-60"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
