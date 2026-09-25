"use client";

import { useCallback, useEffect, useState } from "react";
import type { MealType } from "@/lib/types/database";

// The Supabase browser client is only needed once someone taps a meal, so it
// is kept out of the page's initial JavaScript and loaded in the background
// right after the page appears (see useMealToggles).
const loadClient = () => import("@/lib/supabase/client").then((m) => m.createClient());

export type CellStatus = "idle" | "saving" | "error";

/**
 * Saves one meal ON/OFF straight from the browser to Supabase (RLS allows
 * anyone to write meal_records, by design). Skipping the app server saves a
 * network hop, and unlike Server Actions — which Next.js runs one at a time
 * per tab — several taps in a row are saved in parallel. Only the one
 * column that changed is written.
 */
async function saveMeal(
  employeeId: string,
  dateStr: string,
  meal: MealType,
  value: boolean
): Promise<boolean> {
  // Any failure — network, config, or the database — must come back as
  // `false`, never a thrown error, or the button would stay stuck on "…".
  try {
    const patch: Partial<Record<MealType, boolean>> = { [meal]: value };
    const client = await loadClient();
    const { error } = await client
      .from("meal_records")
      .upsert(
        { employee_id: employeeId, meal_date: dateStr, ...patch },
        { onConflict: "employee_id,meal_date" }
      );
    if (error) console.error("saveMeal failed", error);
    return !error;
  } catch (error) {
    console.error("saveMeal failed", error);
    return false;
  }
}

type MealRow = { employeeId: string } & Record<MealType, boolean>;

/**
 * Local, optimistic meal-sheet state for one date: a tap updates the row
 * immediately, saves in the background, and rolls back (marking the cell
 * red) if the save fails. `toggle` is stable, so memoised rows only
 * re-render when their own data changes.
 */
export function useMealToggles<Row extends MealRow>(date: string, initialRows: Row[]) {
  const [rows, setRows] = useState(initialRows);
  const [cellStatus, setCellStatus] = useState<Record<string, CellStatus>>({});

  // Warm the client while the page is idle, so the first tap saves instantly.
  useEffect(() => {
    const warm = () => void loadClient().catch(() => {});
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 500);
    return () => window.clearTimeout(id);
  }, []);

  const toggle = useCallback(
    async (employeeId: string, meal: MealType, current: boolean) => {
      const key = `${employeeId}:${meal}`;
      const next = !current;
      const setValue = (value: boolean) =>
        setRows((prev) =>
          prev.map((r) => (r.employeeId === employeeId ? { ...r, [meal]: value } : r))
        );

      setValue(next);
      setCellStatus((prev) => ({ ...prev, [key]: "saving" }));

      const ok = await saveMeal(employeeId, date, meal, next);

      if (!ok) setValue(current);
      setCellStatus((prev) => ({ ...prev, [key]: ok ? "idle" : "error" }));
    },
    [date]
  );

  const hasError = Object.values(cellStatus).includes("error");

  return { rows, cellStatus, toggle, hasError };
}

export const MEALS: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
];
