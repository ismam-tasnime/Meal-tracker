"use client";

import { useState, useTransition } from "react";
import { setMealCutoffs } from "@/lib/actions/mess";
import { MEALS } from "@/lib/meals-client";
import { formatCutoff, type MealCutoffs } from "@/lib/utils/cutoffs";

/**
 * Employee meal deadlines (office-wide). Collapsed by default: it's set once
 * and rarely changed. Managers themselves are never held to these times.
 */
export function CutoffSettingsForm({ current }: { current: MealCutoffs }) {
  const [saved, setSaved] = useState(current);
  const [draft, setDraft] = useState(current);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = MEALS.some(({ key }) => draft[key] !== saved[key]);
  const valid = MEALS.every(({ key }) => /^\d{2}:\d{2}$/.test(draft[key]));

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await setMealCutoffs(draft);
      if (result.ok) {
        setSaved(draft);
        setMessage({ type: "ok", text: "Deadlines saved. Employees see them on their next page load." });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-slate-700">🔒 Employee meal deadlines</span>
          <span className="truncate text-xs text-slate-500">
            {MEALS.map(({ key, label }) => `${label} ${formatCutoff(saved[key])}`).join(" · ")}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 group-open:hidden">
          Edit
        </span>
      </summary>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && dirty) save();
        }}
        className="flex flex-col gap-3 border-t border-slate-100 px-4 pb-4 pt-3"
      >
        <p className="text-xs text-slate-500">
          After a meal&rsquo;s deadline, employees can&rsquo;t change today&rsquo;s ON/OFF for that
          meal, and they can never change previous days. Future days stay open. You can still
          change anything, any time, here on Meal Status.
        </p>
        {/* One row per meal on phones: time inputs need more room than a third of the width. */}
        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-3">
          {MEALS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-3 sm:flex-col sm:items-stretch sm:gap-1">
              <label htmlFor={`cutoff-${key}`} className="text-sm font-semibold text-slate-600 sm:text-xs sm:text-slate-500">
                {label}
              </label>
              <input
                id={`cutoff-${key}`}
                type="time"
                required
                value={draft[key]}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                className="h-11 w-40 rounded-xl border border-slate-300 px-3 text-center text-base font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-full"
              />
            </div>
          ))}
        </div>
        <div>
          <button
            type="submit"
            disabled={isPending || !valid || !dirty}
            className="h-10 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save deadlines"}
          </button>
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
      </form>
    </details>
  );
}
