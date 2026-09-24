import { PriceForm } from "@/components/admin/PriceForm";
import { getMyPeriod } from "@/lib/data/periods";
import { getPriceHistory } from "@/lib/data/prices";
import { formatBDT } from "@/lib/utils/currency";
import { todayInOfficeTz } from "@/lib/utils/date";
import { formatPeriodName, formatPeriodRange } from "@/lib/utils/mess";

export const dynamic = "force-dynamic";

export default async function ManagerPricesPage() {
  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  let history: Awaited<ReturnType<typeof getPriceHistory>> = [];
  let loadError: string | null = null;

  try {
    history = await getPriceHistory(period.id);
  } catch {
    loadError = "Could not load prices. Please refresh the page.";
  }

  // History is newest-first: the price in effect today, or for a month that
  // hasn't reached today yet, the latest one set.
  const today = todayInOfficeTz();
  const current = history.find((p) => p.effective_from <= today) ?? history[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Meal Prices</h1>
        <p className="text-sm text-slate-500">
          Prices for your mess month only. Never shown on the public panel or to other mess
          managers.
        </p>
      </div>

      <p className="text-sm font-semibold text-slate-700">
        {formatPeriodName(period)}{" "}
        <span className="font-normal text-slate-500">({formatPeriodRange(period)})</span>
      </p>

      {loadError ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <>
          {history.length === 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No prices set for this mess month yet — meals count as ৳0 until you add them.
            </p>
          )}

          <PriceForm period={period} current={current} />

          {history.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Effective from</th>
                    <th className="px-3 py-2 font-semibold">Breakfast</th>
                    <th className="px-3 py-2 font-semibold">Lunch</th>
                    <th className="px-3 py-2 font-semibold">Dinner</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2 text-slate-700">{p.effective_from}</td>
                      <td className="px-3 py-2 text-slate-700">{formatBDT(p.breakfast_price)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatBDT(p.lunch_price)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatBDT(p.dinner_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
