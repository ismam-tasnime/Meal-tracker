/** An employee's name with their token number (TKN) beside it, when they have one. */
export function EmployeeName({ name, tokenNo }: { name: string; tokenNo: number | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {tokenNo !== null && (
        <span className="inline-flex h-5 min-w-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 px-1.5 text-xs font-semibold tabular-nums text-indigo-700">
          {tokenNo}
        </span>
      )}
      <span className="min-w-0">{name}</span>
    </span>
  );
}

/** Plain-text version for dropdowns and CSV: "164 · Romith OP". */
export function employeeLabel(name: string, tokenNo: number | null): string {
  return tokenNo === null ? name : `${tokenNo} · ${name}`;
}
