"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updatePrices } from "@/lib/actions/prices";
import { formatBDT } from "@/lib/utils/currency";
import type { MealPrice } from "@/lib/types/database";
import { todayInOfficeTz } from "@/lib/utils/date";

export function PriceForm({ current }: { current: MealPrice | null }) {
  const router = useRouter();
  const [breakfast, setBreakfast] = useState(String(current?.breakfast_price ?? ""));
  const [lunch, setLunch] = useState(String(current?.lunch_price ?? ""));
  const [dinner, setDinner] = useState(String(current?.dinner_price ?? ""));
  const [effectiveFrom, setEffectiveFrom] = useState(todayInOfficeTz());
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updatePrices({
        breakfastPrice: Number(breakfast),
        lunchPrice: Number(lunch),
        dinnerPrice: Number(dinner),
        effectiveFrom,
      });
      if (result.ok) {
        setMessage({ type: "ok", text: "Prices saved." });
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {current && (
        <p className="text-sm text-slate-500">
          Current: Breakfast {formatBDT(current.breakfast_price)} · Lunch{" "}
          {formatBDT(current.lunch_price)} · Dinner {formatBDT(current.dinner_price)} (since{" "}
          {current.effective_from})
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-slate-700">Breakfast price (৳)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={breakfast}
            onChange={(e) => setBreakfast(e.target.value)}
            required
            className="h-10 rounded-xl border border-slate-300 px-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-slate-700">Lunch price (৳)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={lunch}
            onChange={(e) => setLunch(e.target.value)}
            required
            className="h-10 rounded-xl border border-slate-300 px-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-slate-700">Dinner price (৳)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={dinner}
            onChange={(e) => setDinner(e.target.value)}
            required
            className="h-10 rounded-xl border border-slate-300 px-3 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1 sm:w-56">
        <label className="text-sm font-semibold text-slate-700">Effective from</label>
        <input
          type="date"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          className="h-10 rounded-xl border border-slate-300 px-3 text-sm"
        />
        <p className="text-xs text-slate-400">
          Applies to this date onward. Meals before this date keep using the price that was in
          effect then.
        </p>
      </div>

      {message && (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            message.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-10 w-fit rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save prices"}
      </button>
    </form>
  );
}
