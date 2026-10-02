import type { MyEggDay } from "@/lib/data/eggs";
import type { MyStatementRow } from "@/lib/types/database";
import { formatBDT } from "@/lib/utils/currency";
import { formatDisplayDate } from "@/lib/utils/date";

/**
 * The employee's own eggs for one mess month: how many, at what price, what
 * they cost, and the same date by date. Read-only — only the mess manager
 * can record or change an egg quantity or price (0019_egg_tracking.sql,
 * where employees have no write policy on egg_records at all).
 *
 * Eggs are an extra charge: they are never part of the meal count above and
 * never change the meal rate.
 */
export function MyEggs({
  statement,
  days,
}: {
  statement: MyStatementRow;
  days: MyEggDay[];
}) {
  const prices = [...new Set(days.map((d) => d.price))];
  const pricePerEgg = prices.length === 1 ? formatBDT(prices[0]) : "Varies by date";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 px-2 py-3 ring-1 ring-inset ring-slate-200">
          <dt className="text-xs font-semibold text-slate-500">Eggs consumed</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
            {statement.egg_count}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-2 py-3 ring-1 ring-inset ring-slate-200">
          <dt className="text-xs font-semibold text-slate-500">Price per egg</dt>
          <dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 sm:text-xl">
            {days.length === 0 ? "—" : pricePerEgg}
          </dd>
        </div>
        <div className="rounded-xl bg-amber-50 px-2 py-3 ring-1 ring-inset ring-amber-200">
          <dt className="text-xs font-semibold text-amber-700">Egg total</dt>
          <dd className="mt-0.5 text-xl font-bold tabular-nums text-amber-900">
            {formatBDT(statement.egg_total)}
          </dd>
        </div>
      </dl>

      {days.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">No eggs recorded for this month.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-2 py-2 text-right font-semibold">Eggs</th>
                <th className="px-2 py-2 text-right font-semibold">Price/egg</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-700">{formatDisplayDate(day.date)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">{day.qty}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                    {formatBDT(day.price)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                    {formatBDT(day.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-3 py-2 text-xs font-semibold text-slate-600">Total</td>
                <td className="px-2 py-2 text-right text-xs font-bold tabular-nums text-slate-800">
                  {statement.egg_count}
                </td>
                <td />
                <td className="px-3 py-2 text-right text-xs font-bold tabular-nums text-slate-900">
                  {formatBDT(statement.egg_total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        Eggs are an extra charge set by the mess manager. They don&rsquo;t add to your breakfast,
        lunch, dinner or meal count — they&rsquo;re added to your bill once the meal rate is
        published.
      </p>
    </div>
  );
}
