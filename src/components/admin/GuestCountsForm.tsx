"use client";

import { useState, useTransition } from "react";
import { setGuestMeals } from "@/lib/actions/mess";
import { MEALS } from "@/lib/meals-client";
import type { MealType } from "@/lib/types/database";
import { formatBDT } from "@/lib/utils/currency";
import { formatDisplayDate } from "@/lib/utils/date";
import {
  GUEST_MEAL_RATES,
  MAX_GUESTS,
  NO_GUESTS,
  guestBill,
  hasGuests,
  parseGuestCount,
  type GuestCounts,
} from "@/lib/utils/guests";

const MEAL_ICONS: Record<MealType, string> = { breakfast: "🍳", lunch: "🍛", dinner: "🌙" };

/** 0 shows as an empty box, so typing a count never means deleting a 0 first. */
const toDraft = (counts: GuestCounts): Record<MealType, string> => ({
  breakfast: counts.breakfast ? String(counts.breakfast) : "",
  lunch: counts.lunch ? String(counts.lunch) : "",
  dinner: counts.dinner ? String(counts.dinner) : "",
});

/**
 * One date's guests: a count per meal, with each meal's bill (guests × the
 * fixed rate) and the date's total worked out as you type. Saving
 * overwrites the date's one record; all zeros removes it.
 */
export function GuestCountsForm({ date, initial }: { date: string; initial: GuestCounts }) {
  // Keyed by `date` from the parent, so this remounts with fresh state per date.
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isSaving, startSaving] = useTransition();

  const parsed: Record<MealType, number | null> = {
    breakfast: parseGuestCount(draft.breakfast),
    lunch: parseGuestCount(draft.lunch),
    dinner: parseGuestCount(draft.dinner),
  };
  const valid = MEALS.every(({ key }) => parsed[key] !== null);
  const counts: GuestCounts = {
    breakfast: parsed.breakfast ?? 0,
    lunch: parsed.lunch ?? 0,
    dinner: parsed.dinner ?? 0,
  };
  const bill = guestBill(counts);
  const dirty = MEALS.some(({ key }) => parsed[key] !== saved[key]);

  function save(next: GuestCounts) {
    setMessage(null);
    startSaving(async () => {
      const result = await setGuestMeals(date, next);
      if (result.ok) {
        setSaved(next);
        setDraft(toDraft(next));
        setMessage({
          type: "ok",
          text: hasGuests(next)
            ? `Guests saved for ${formatDisplayDate(date)}. The cook sees them on the meal board.`
            : `No guests for ${formatDisplayDate(date)}.`,
        });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  function clear() {
    if (!window.confirm(`Remove all guests for ${formatDisplayDate(date)}?`)) return;
    save(NO_GUESTS);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && dirty) save(counts);
      }}
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">👥 Guests on {formatDisplayDate(date)}</h2>
        <span
          className={`text-xs ${dirty ? "font-semibold text-amber-700" : "text-slate-400"}`}
          aria-live="polite"
        >
          {dirty ? "Not saved yet" : hasGuests(saved) ? "Saved" : "No guests"}
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-slate-100">
        {MEALS.map(({ key, label }) => {
          const invalid = parsed[key] === null;
          return (
            <li key={key} className="flex items-center gap-2 py-2.5 sm:gap-3">
              <label htmlFor={`guests-${key}`} className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800">
                  <span aria-hidden>{MEAL_ICONS[key]}</span> {label}
                </span>
                <span className="block text-xs text-slate-500">
                  {formatBDT(GUEST_MEAL_RATES[key])} per guest
                </span>
              </label>
              <input
                id={`guests-${key}`}
                type="number"
                inputMode="numeric"
                min="0"
                max={MAX_GUESTS}
                step="1"
                placeholder="0"
                value={draft[key]}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                aria-invalid={invalid}
                className={`h-11 w-20 shrink-0 rounded-xl border px-2 text-center text-base font-semibold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-1 ${
                  invalid
                    ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                }`}
              />
              <span className="w-24 shrink-0 text-right">
                <span className="block text-sm font-bold tabular-nums text-slate-900">
                  {invalid ? "—" : formatBDT(bill[key])}
                </span>
                <span className="block text-[11px] tabular-nums text-slate-400">
                  {invalid ? "Whole number" : `${counts[key]} × ${formatBDT(GUEST_MEAL_RATES[key])}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-200">
        <span className="text-sm font-semibold text-slate-700">Total guest bill</span>
        <span className="text-lg font-bold tabular-nums text-slate-900">
          {valid ? formatBDT(bill.total) : "—"}
        </span>
      </div>

      {!valid && (
        <p role="alert" className="text-xs text-red-700">
          Guests must be whole numbers from 0 to {MAX_GUESTS.toLocaleString("en-US")}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isSaving || !valid || !dirty}
          className="h-10 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save guests"}
        </button>
        {hasGuests(saved) && (
          <button
            type="button"
            disabled={isSaving}
            onClick={clear}
            className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Clear guests
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Leave a box empty for no guests at that meal. The office pays for guests, so no
        employee&rsquo;s meal count or bill changes.
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
