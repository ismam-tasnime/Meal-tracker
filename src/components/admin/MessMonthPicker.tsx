"use client";

import { MONTH_NAMES, todayInOfficeTz } from "@/lib/utils/date";
import { formatPeriodRange, messMonthRange } from "@/lib/utils/mess";

export type MessMonth = { year: number; month: number };

const SELECT_CLASS =
  "h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/** Month + year picker for a mess month, showing the exact 5th-to-5th dates it covers. */
export function MessMonthPicker({
  value,
  onChange,
  id = "messMonth",
}: {
  value: MessMonth;
  onChange: (value: MessMonth) => void;
  id?: string;
}) {
  const thisYear = Number(todayInOfficeTz().slice(0, 4));
  const years = [thisYear - 1, thisYear, thisYear + 1];

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        Mess month you manage
      </label>
      <div className="flex gap-2">
        <select
          id={id}
          value={value.month}
          onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}
          className={`${SELECT_CLASS} flex-1`}
        >
          {MONTH_NAMES.map((name, idx) => (
            <option key={name} value={idx + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Year"
          value={value.year}
          onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
          className={SELECT_CLASS}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-slate-400">
        Covers {formatPeriodRange(messMonthRange(value.year, value.month))}.
      </p>
    </div>
  );
}
