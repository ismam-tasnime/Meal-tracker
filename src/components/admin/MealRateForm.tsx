"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMealRate } from "@/lib/actions/mess";
import { formatBDT } from "@/lib/utils/currency";

/**
 * Month-end meal rate. Until it's set (or after it's cleared by saving an
 * empty box), bills everywhere show "—".
 */
export function MealRateForm({ current }: { current: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current === null ? "" : String(current));
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(rate: number | null) {
    setMessage(null);
    startTransition(async () => {
      const result = await setMealRate(rate);
      if (result.ok) {
        setMessage({ type: "ok", text: rate === null ? "Meal rate cleared." : "Meal rate saved." });
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() === "") {
          if (current !== null) save(null);
        } else {
          save(Number(value));
        }
      }}
      className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="mealRate" className="text-sm font-semibold text-slate-700">
          Meal rate (৳ per meal count)
        </label>
        <span className="text-xs text-slate-500">
          Current: {current === null ? "—" : formatBDT(current)}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          id="mealRate"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="e.g. 65"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 w-full max-w-[10rem] rounded-xl border border-slate-300 px-3 text-base font-semibold focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={
            isPending ||
            (value.trim() === "" ? current === null : !(Number(value) >= 0) || Number(value) === current)
          }
          className="h-11 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? "Saving…" : value.trim() === "" && current !== null ? "Clear rate" : "Save rate"}
        </button>
      </div>
      <p className="text-xs text-slate-400">
        Set this at month end. Empty the box and save to clear it.
      </p>
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
  );
}
