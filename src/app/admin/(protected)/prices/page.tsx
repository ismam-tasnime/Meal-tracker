import { PriceForm } from "@/components/admin/PriceForm";
import { getCurrentPrices, getPriceHistory } from "@/lib/data/prices";
import { formatBDT } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

export default async function AdminPricesPage() {
  let current = null;
  let history: Awaited<ReturnType<typeof getPriceHistory>> = [];
  let loadError: string | null = null;

  try {
    [current, history] = await Promise.all([getCurrentPrices(), getPriceHistory()]);
  } catch {
    loadError = "Could not load prices. Please refresh the page.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Meal Prices</h1>
        <p className="text-sm text-slate-500">
          Never shown on the public panel. Used only for admin monthly calculations.
        </p>
      </div>

      {loadError ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <>
          <PriceForm current={current} />

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
