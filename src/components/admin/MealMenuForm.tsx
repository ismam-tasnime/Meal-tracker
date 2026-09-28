"use client";

import { useState, useTransition } from "react";
import { setDayMenu } from "@/lib/actions/mess";
import { MEALS } from "@/lib/meals-client";
import type { MealType } from "@/lib/types/database";
import { cleanMenuItem, MAX_MENU_ITEM, type DayMenu } from "@/lib/utils/mess";

const PLACEHOLDERS: Record<MealType, string> = {
  breakfast: "e.g. Khichuri",
  lunch: "e.g. Beef, rice, dal",
  dinner: "e.g. Chicken curry",
};

const toDraft = (menu: DayMenu): Record<MealType, string> => ({
  breakfast: menu.breakfast ?? "",
  lunch: menu.lunch ?? "",
  dinner: menu.dinner ?? "",
});

/**
 * What's being served on this date. Employees see each dish under that meal
 * in their panel; a blank box means nothing announced, and blanking all
 * three removes the date's menu.
 */
export function MealMenuForm({ date, initial }: { date: string; initial: DayMenu }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isSaving, startSaving] = useTransition();

  const draftMenu: DayMenu = {
    breakfast: cleanMenuItem(draft.breakfast),
    lunch: cleanMenuItem(draft.lunch),
    dinner: cleanMenuItem(draft.dinner),
  };
  const dirty = MEALS.some(({ key }) => draftMenu[key] !== saved[key]);
  const announced = MEALS.filter(({ key }) => saved[key] !== null);

  function save(menu: DayMenu) {
    setMessage(null);
    startSaving(async () => {
      const result = await setDayMenu(date, menu);
      if (result.ok) {
        setSaved(menu);
        setDraft(toDraft(menu));
        const cleared = MEALS.every(({ key }) => menu[key] === null);
        setMessage({
          type: "ok",
          text: cleared
            ? "Menu cleared for this date."
            : "Menu saved. Employees see it under each meal.",
        });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save(draftMenu);
      }}
      className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-linear-to-br from-amber-50/70 to-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">🍲 What&rsquo;s cooking this date</h2>
        <span className="text-xs text-amber-700/70">
          {announced.length === 0 ? "Nothing announced" : "Employees can see this"}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-3">
        {MEALS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`menu-${key}`} className="text-xs font-semibold text-slate-500">
              {label}
            </label>
            <input
              id={`menu-${key}`}
              type="text"
              maxLength={MAX_MENU_ITEM}
              autoComplete="off"
              placeholder={PLACEHOLDERS[key]}
              value={draft[key]}
              onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
              className="h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-base text-slate-900 placeholder:text-slate-300 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isSaving || !dirty}
          className="h-10 rounded-full bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save menu"}
        </button>
        {announced.length > 0 && (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => save({ breakfast: null, lunch: null, dinner: null })}
            className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Clear menu
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Leave a box empty to announce nothing for that meal. This is just the dish name — it
        doesn&rsquo;t change anyone&rsquo;s meal count or bill.
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
