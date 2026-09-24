"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDeposit } from "@/lib/actions/mess";
import type { Employee } from "@/lib/types/database";
import { todayInOfficeTz } from "@/lib/utils/date";
import { employeeLabel } from "@/components/EmployeeName";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function DepositForm({
  employees,
}: {
  employees: Pick<Employee, "id" | "name" | "token_no">[];
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [depositedOn, setDepositedOn] = useState(todayInOfficeTz());
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await addDeposit({
        employeeId,
        amount: Number(amount),
        depositedOn,
        note,
      });
      if (result.ok) {
        const name = employees.find((emp) => emp.id === employeeId)?.name ?? "employee";
        setMessage({ type: "ok", text: `Deposit of ৳${Number(amount)} recorded for ${name}.` });
        setAmount("");
        setNote("");
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-slate-700">Record a deposit</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="depositEmployee" className="text-xs font-medium text-slate-500">
            Employee name
          </label>
          <select
            id="depositEmployee"
            required
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="" disabled>
              Select employee…
            </option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {employeeLabel(emp.name, emp.token_no)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="depositAmount" className="text-xs font-medium text-slate-500">
            Deposit amount (৳)
          </label>
          <input
            id="depositAmount"
            type="number"
            inputMode="decimal"
            required
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="depositDate" className="text-xs font-medium text-slate-500">
            Date received
          </label>
          <input
            id="depositDate"
            type="date"
            value={depositedOn}
            onChange={(e) => setDepositedOn(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="depositNote" className="text-xs font-medium text-slate-500">
            Note (optional)
          </label>
          <input
            id="depositNote"
            type="text"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      {message && (
        <p
          role={message.type === "error" ? "alert" : undefined}
          className={`rounded-xl px-3 py-2 text-sm ${
            message.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !employeeId || !(Number(amount) > 0)}
        className="h-11 w-fit rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Add deposit"}
      </button>
    </form>
  );
}
