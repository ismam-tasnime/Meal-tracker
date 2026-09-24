/** An employee's name with their token number (TKN) beside it, when they have one. */
export function EmployeeName({ name, tokenNo }: { name: string; tokenNo: number | null }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      {tokenNo !== null && (
        <span className="shrink-0 text-xs font-normal tabular-nums text-slate-400">{tokenNo}</span>
      )}
      <span className="min-w-0">{name}</span>
    </span>
  );
}

/** Plain-text version for dropdowns and CSV: "164 · Romith OP". */
export function employeeLabel(name: string, tokenNo: number | null): string {
  return tokenNo === null ? name : `${tokenNo} · ${name}`;
}
