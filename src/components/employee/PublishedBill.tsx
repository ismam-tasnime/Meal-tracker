import type { MyStatementRow } from "@/lib/types/database";
import { formatBDT } from "@/lib/utils/currency";
import { formatOfficeDateTime } from "@/lib/utils/date";
import { balanceStatus, formatMealCount } from "@/lib/utils/mess";

/**
 * The employee's real bill, once the mess manager has published the meal
 * rate: rate, meal count, meal cost, egg charges, the total, what they've
 * paid, and what's due or refunded. Uses the same numbers as the manager's
 * Expense Status. A rate the manager is only testing never reaches here
 * (get_my_statement, 0013).
 *
 * The egg charge (0019) is an extra on top of the meal cost: it is shown on
 * its own line and only joins the total once the rate is published — before
 * that there is no finalised bill to add it to (see "My eggs" above).
 */
export function PublishedBill({ statement }: { statement: MyStatementRow }) {
  const rate = statement.meal_rate;

  if (rate === null || statement.total_bill === null || statement.final_bill === null) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-center text-xs text-slate-500">
        The mess manager hasn&rsquo;t published this month&rsquo;s meal rate yet. Your bill will
        show here once it&rsquo;s published
        {statement.egg_total > 0 && <>, including your {formatBDT(statement.egg_total)} egg charge</>}.
      </p>
    );
  }

  const mealCost = statement.total_bill;
  const eggCost = statement.egg_total;
  const bill = statement.final_bill;
  const paid = statement.total_deposit;
  const status = balanceStatus(statement.balance);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg leading-none">
          📢
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-emerald-900">The meal rate has been published</p>
          <p className="mt-0.5 text-sm text-emerald-900">
            The meal rate is <strong className="tabular-nums">{formatBDT(rate)}</strong>. Your total
            bill is <strong className="tabular-nums">{formatBDT(bill)}</strong>
            {eggCost > 0 && (
              <>
                {" "}
                ({formatBDT(mealCost)} meals + {formatBDT(eggCost)} eggs)
              </>
            )}{" "}
            and you have paid <strong className="tabular-nums">{formatBDT(paid)}</strong>.{" "}
            {status.kind === "due" ? (
              <>
                Your due is{" "}
                <strong className="tabular-nums text-red-700">{formatBDT(status.amount)}</strong>.
              </>
            ) : status.kind === "remaining" ? (
              <>
                You will get a refund of{" "}
                <strong className="tabular-nums text-emerald-700">{formatBDT(status.amount)}</strong>.
              </>
            ) : (
              <>You are fully settled.</>
            )}
          </p>
          {statement.rate_published_at && (
            <p className="mt-1 text-[11px] text-emerald-700">
              Published {formatOfficeDateTime(statement.rate_published_at)}
            </p>
          )}
        </div>
      </div>

      <dl className="mt-3 divide-y divide-emerald-100 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-emerald-100">
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-slate-500">Meal rate</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{formatBDT(rate)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-slate-500">Meal cost</dt>
          <dd className="text-right font-semibold tabular-nums text-slate-900">
            <span className="mr-1.5 text-xs font-medium text-slate-400">
              {formatMealCount(statement.meal_count)} × {formatBDT(rate)} =
            </span>
            {formatBDT(mealCost)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-slate-500">
            Egg charges
            <span className="block text-[11px] text-slate-400">additional charge</span>
          </dt>
          <dd className="text-right font-semibold tabular-nums text-slate-900">
            {statement.egg_count > 0 && (
              <span className="mr-1.5 text-xs font-medium text-slate-400">
                {statement.egg_count} egg{statement.egg_count > 1 ? "s" : ""} =
              </span>
            )}
            {formatBDT(eggCost)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="font-semibold text-slate-700">Total bill</dt>
          <dd className="font-bold tabular-nums text-slate-900">{formatBDT(bill)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-slate-500">You have paid</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{formatBDT(paid)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-slate-500">
            {status.kind === "due" ? "Due" : status.kind === "remaining" ? "Refund" : "Balance"}
          </dt>
          <dd className="font-bold tabular-nums">
            {status.kind === "due" ? (
              <span className="text-red-700">{formatBDT(status.amount)}</span>
            ) : status.kind === "remaining" ? (
              <span className="text-emerald-700">{formatBDT(status.amount)}</span>
            ) : (
              <span className="text-slate-600">Fully settled</span>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-emerald-800/70">
        Counts every meal that&rsquo;s ON this month, plus any eggs the mess manager recorded for
        you — the same numbers as the mess manager&rsquo;s bill.
      </p>
    </div>
  );
}
