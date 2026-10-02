"use client";

import { useState, useTransition } from "react";
import type { EmployeeListItem as Employee } from "@/lib/data/employees";
import {
  createEmployee,
  deleteEmployee,
  resetEmployeeLogin,
  setEmployeeActive,
  updateEmployee,
} from "@/lib/actions/employees";
import { EmployeeName } from "@/components/EmployeeName";

/** "" → no token; otherwise the number (validated again on the server). */
function parseToken(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function EmployeeManager({ initialEmployees: employees }: { initialEmployees: Employee[] }) {
  const [newName, setNewName] = useState("");
  const [newToken, setNewToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingToken, setEditingToken] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await createEmployee(newName, parseToken(newToken));
      if (result.ok) {
        setNewName("");
        setNewToken("");
      } else {
        setError(result.error);
      }
    });
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id);
    setEditingName(employee.name);
    setEditingToken(employee.token_no === null ? "" : String(employee.token_no));
  }

  function saveEdit(id: string) {
    if (!editingName.trim()) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await updateEmployee(id, editingName, parseToken(editingToken));
      if (result.ok) {
        setEditingId(null);
      } else {
        setError(result.error);
      }
    });
  }

  function toggleActive(employee: Employee) {
    startTransition(async () => {
      const result = await setEmployeeActive(employee.id, !employee.is_active);
      if (result.ok) {
      } else {
        setError(result.error);
      }
    });
  }

  function remove(employee: Employee) {
    if (!confirm(`Remove ${employee.name}? This only works if they have no meal history.`)) {
      return;
    }
    startTransition(async () => {
      const result = await deleteEmployee(employee.id);
      if (result.ok) {
      } else {
        setError(result.error);
      }
    });
  }

  function resetLogin(employee: Employee) {
    if (
      !confirm(
        `Reset ${employee.name}'s login? They'll need to sign up again with token ${employee.token_no}, an Employee ID and a new password. Their meals, eggs and deposits stay.`
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await resetEmployeeLogin(employee.id);
      if (result.ok) {
        setNotice(`${employee.name} can now sign up again at /employee/signup.`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <input
          value={newToken}
          onChange={(e) => setNewToken(e.target.value)}
          placeholder="Token"
          aria-label="Token number"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          className="h-10 w-20 shrink-0 rounded-xl border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New employee name"
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={isPending || !newName.trim()}
          className="h-10 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
        >
          Add
        </button>
      </form>

      <p className="-mt-2 text-xs text-slate-500">
        An employee can sign up at <span className="font-semibold">/employee/signup</span> with
        their Token Number.
      </p>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {employees.map((employee) => (
            <li key={employee.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
              {editingId === employee.id ? (
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  <input
                    value={editingToken}
                    onChange={(e) => setEditingToken(e.target.value)}
                    placeholder="Token"
                    aria-label="Token number"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    className="h-9 w-16 shrink-0 rounded-xl border border-slate-300 px-2 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(employee.id)}
                  />
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    aria-label="Name"
                    autoFocus
                    className="h-9 min-w-0 flex-1 rounded-xl border border-slate-300 px-2 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(employee.id)}
                  />
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={[
                        "truncate text-sm font-semibold",
                        employee.is_active ? "text-slate-800" : "text-slate-400 line-through",
                      ].join(" ")}
                    >
                      <EmployeeName name={employee.name} tokenNo={employee.token_no} />
                    </span>
                    {!employee.is_active && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        Inactive
                      </span>
                    )}
                  </span>
                  <LoginStatus
                    tokenNo={employee.token_no}
                    hasLogin={employee.hasLogin}
                    employeeCode={employee.employeeCode}
                    phone={employee.phone}
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {editingId === employee.id ? (
                  <button
                    onClick={() => saveEdit(employee.id)}
                    disabled={isPending}
                    className="h-8 rounded-full bg-indigo-600 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                  >
                    Save
                  </button>
                ) : (
                  <button
                    onClick={() => startEdit(employee)}
                    className="h-8 rounded-full border border-slate-200 px-2.5 text-xs font-semibold text-slate-600"
                  >
                    Edit
                  </button>
                )}
                {employee.token_no !== null && (
                  <button
                    onClick={() => resetLogin(employee)}
                    className="h-8 rounded-full border border-amber-200 px-2.5 text-xs font-semibold text-amber-700"
                  >
                    Reset login
                  </button>
                )}
                <button
                  onClick={() => toggleActive(employee)}
                  className="h-8 rounded-full border border-slate-200 px-2.5 text-xs font-semibold text-slate-600"
                >
                  {employee.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => remove(employee)}
                  className="h-8 rounded-full border border-red-200 px-2.5 text-xs font-semibold text-red-600"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
          {employees.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-400">
              No employees yet — add the first one above.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

/**
 * Whether the employee has signed up with their Token Number, and — once
 * they have — the Employee ID they sign in with and the phone number they
 * gave (0018). Managers can read these; they can't change them, and
 * resetting the login clears the Employee ID.
 */
function LoginStatus({
  tokenNo,
  hasLogin,
  employeeCode,
  phone,
}: {
  tokenNo: number | null;
  hasLogin: boolean;
  employeeCode: string | null;
  phone: string | null;
}) {
  if (tokenNo === null) {
    return <span className="text-xs text-amber-700">No token number — can&rsquo;t sign up yet</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      {hasLogin ? (
        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          Signed up
        </span>
      ) : (
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
          Not signed up
        </span>
      )}
      {employeeCode && <span className="truncate">ID {employeeCode}</span>}
      {phone && <span className="tabular-nums">{phone}</span>}
    </span>
  );
}
