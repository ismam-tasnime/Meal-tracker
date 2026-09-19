"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Employee } from "@/lib/types/database";
import {
  createEmployee,
  deleteEmployee,
  setEmployeeActive,
  updateEmployeeName,
} from "@/lib/actions/employees";

export function EmployeeManager({ initialEmployees: employees }: { initialEmployees: Employee[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createEmployee(newName);
      if (result.ok) {
        setNewName("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id);
    setEditingName(employee.name);
  }

  function saveEdit(id: string) {
    if (!editingName.trim()) return;
    startTransition(async () => {
      const result = await updateEmployeeName(id, editingName);
      if (result.ok) {
        setEditingId(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function toggleActive(employee: Employee) {
    startTransition(async () => {
      const result = await setEmployeeActive(employee.id, !employee.is_active);
      if (result.ok) {
        router.refresh();
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
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New employee name"
          className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={isPending || !newName.trim()}
          className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          Add
        </button>
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {employees.map((employee) => (
            <li key={employee.id} className="flex items-center gap-2 px-3 py-2.5">
              {editingId === employee.id ? (
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  autoFocus
                  className="h-9 flex-1 rounded-md border border-slate-300 px-2 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && saveEdit(employee.id)}
                />
              ) : (
                <span
                  className={[
                    "flex-1 truncate text-sm font-medium",
                    employee.is_active ? "text-slate-800" : "text-slate-400 line-through",
                  ].join(" ")}
                >
                  {employee.name}
                </span>
              )}

              {!employee.is_active && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  Inactive
                </span>
              )}

              {editingId === employee.id ? (
                <button
                  onClick={() => saveEdit(employee.id)}
                  className="h-8 rounded-md bg-indigo-600 px-2.5 text-xs font-semibold text-white"
                >
                  Save
                </button>
              ) : (
                <button
                  onClick={() => startEdit(employee)}
                  className="h-8 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600"
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => toggleActive(employee)}
                className="h-8 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600"
              >
                {employee.is_active ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={() => remove(employee)}
                className="h-8 rounded-md border border-red-200 px-2.5 text-xs font-medium text-red-600"
              >
                Remove
              </button>
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
