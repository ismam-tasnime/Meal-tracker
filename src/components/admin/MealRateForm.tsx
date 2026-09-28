"use client";

import { useState, useTransition } from "react";
import { publishMealRate, setMealRate } from "@/lib/actions/mess";
import { formatBDT } from "@/lib/utils/currency";
import { formatOfficeDateTime } from "@/lib/utils/date";

/**
 * The meal rate, in two steps:
 *   Test    — bills on the manager's pages use it; employees don't see it.
 *             Try as many rates as you like during the month.
 *   Publish — every employee sees the rate with their bill, deposit, and
 *             due/refund. Testing again afterwards doesn't change what
 *             employees see until the next publish.
 */
export function MealRateForm({
  current,
  published,
  publishedAt,
}: {
  /** The rate being tested (what the manager's bills use). */
  current: number | null;
  /** The rate employees see; null = not published. */
  published: number | null;
  publishedAt: string | null;
}) {
  const [value, setValue] = useState(current === null ? "" : String(current));
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const empty = value.trim() === "";
  const rate = Number(value);
  const valid = !empty && Number.isFinite(rate) && rate >= 0;

  function run(action: () => ReturnType<typeof setMealRate>, okText: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? { type: "ok", text: okText } : { type: "error", text: result.error });
    });
  }

  function test() {
    if (empty) {
      run(() => setMealRate(null), "Test rate cleared.");
    } else {
      run(
        () => setMealRate(rate),
        `Testing ${formatBDT(rate)} — bills below use it. Employees don’t see it until you publish.`
      );
    }
  }

  function publish() {
    if (!valid) return;
    const ok = window.confirm(
      `Publish ${formatBDT(rate)} as the meal rate?\n\nEvery employee will see it with their total bill, deposit, and due or refund.`
    );
    if (!ok) return;
    run(() => publishMealRate(rate), `Published ${formatBDT(rate)} to every employee.`);
  }

  function unpublish() {
    const ok = window.confirm("Unpublish the meal rate? Employees will no longer see a rate or bill.");
    if (!ok) return;
    run(() => publishMealRate(null), "Meal rate unpublished. Employees no longer see it.");
  }

  const testDisabled = isPending || (empty ? current === null : !valid || rate === current);
  const publishDisabled = isPending || !valid || (rate === published && rate === current);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!testDisabled) test();
      }}
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <label htmlFor="mealRate" className="text-sm font-semibold text-slate-700">
        Meal rate (৳ per meal count)
      </label>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">
          <dt className="font-semibold text-slate-500">Testing (only you)</dt>
          <dd className="mt-0.5 text-base font-bold tabular-nums text-slate-900">
            {current === null ? "—" : formatBDT(current)}
          </dd>
        </div>
        <div
          className={`rounded-xl px-3 py-2 ring-1 ring-inset ${
            published === null ? "bg-slate-50 ring-slate-200" : "bg-emerald-50 ring-emerald-200"
          }`}
        >
          <dt className={`font-semibold ${published === null ? "text-slate-500" : "text-emerald-700"}`}>
            Published to employees
          </dt>
          <dd className="mt-0.5 text-base font-bold tabular-nums text-slate-900">
            {published === null ? "Not yet" : formatBDT(published)}
          </dd>
          {published !== null && publishedAt && (
            <dd className="text-[11px] text-emerald-700">
              {formatOfficeDateTime(publishedAt)}
            </dd>
          )}
        </div>
      </dl>

      <input
        id="mealRate"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        placeholder="e.g. 65"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 w-full rounded-xl border border-slate-300 px-3 text-base font-semibold focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="submit"
          disabled={testDisabled}
          className="h-11 rounded-full border border-indigo-300 bg-white px-3 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50"
        >
          {isPending ? "Saving…" : empty && current !== null ? "Clear test rate" : "Test meal rate"}
        </button>
        <button
          type="button"
          onClick={publish}
          disabled={publishDisabled}
          className="h-11 rounded-full bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Publish meal rate"}
        </button>
      </div>

      <p className="text-xs text-slate-400">
        <span className="font-semibold text-slate-500">Test</span> changes the bills on your pages
        only — try as many rates as you like. <span className="font-semibold text-slate-500">Publish</span>{" "}
        sends the rate to every employee with their total bill, deposit, and due or refund.
      </p>

      {published !== null && (
        <button
          type="button"
          onClick={unpublish}
          disabled={isPending}
          className="self-start text-xs font-semibold text-slate-500 underline underline-offset-2 hover:text-red-700 disabled:opacity-50"
        >
          Unpublish
        </button>
      )}

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
