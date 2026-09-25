import { formatBDT } from "@/lib/utils/currency";
import { balanceStatus } from "@/lib/utils/mess";

/**
 * "Amount to be Paid", spelled out: never a bare negative number.
 * balance = deposit − bill, so positive is money left over.
 */
export function BalanceBadge({ balance }: { balance: number | null }) {
  const status = balanceStatus(balance);

  switch (status.kind) {
    case "pending":
      return <span className="text-slate-400">—</span>;
    case "settled":
      return (
        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          Fully settled
        </span>
      );
    case "remaining":
      return (
        <span className="inline-flex flex-col items-end">
          <span className="font-semibold tabular-nums text-emerald-700">
            {formatBDT(status.amount)}
          </span>
          <span className="text-[11px] font-semibold text-emerald-600">Remaining (refund)</span>
        </span>
      );
    case "due":
      return (
        <span className="inline-flex flex-col items-end">
          <span className="font-semibold tabular-nums text-red-700">{formatBDT(status.amount)}</span>
          <span className="text-[11px] font-semibold text-red-600">Due (to pay)</span>
        </span>
      );
  }
}
