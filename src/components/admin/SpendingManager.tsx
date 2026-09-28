"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  addSpending,
  deleteSpending,
  sumSpending,
  updateSpending,
  type SpendingInput,
} from "@/lib/actions/mess";
import type { SpendingEntry } from "@/lib/data/spending";
import { formatBDT } from "@/lib/utils/currency";
import {
  formatDisplayDate,
  formatShortDate,
  isValidDateStr,
  todayInOfficeTz,
} from "@/lib/utils/date";
import { isDateInPeriod, periodLastDay, type PeriodRange } from "@/lib/utils/mess";
import {
  MAX_PERSON_NAME,
  cleanPersonName,
  isValidSpendingAmount,
  roundAmount,
} from "@/lib/utils/spending";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

/** Today if it's in the month; otherwise the month's nearest end. */
function defaultSpendDate(period: PeriodRange): string {
  const today = todayInOfficeTz();
  if (isDateInPeriod(today, period)) return today;
  return today < period.start_date ? period.start_date : periodLastDay(period);
}

function describe(entry: Pick<SpendingEntry, "spent_on" | "person_name" | "amount">): string {
  return `${formatBDT(entry.amount)} spent by ${entry.person_name} on ${formatDisplayDate(entry.spent_on)}`;
}

/**
 * Add or edit one spending entry, as a modal: the page behind can't be
 * tapped, and Esc, Cancel, or tapping outside closes it. Rendered only while
 * open (the parent remounts it for each entry).
 */
function SpendingDialog({
  entry,
  period,
  names,
  onClose,
  onDone,
}: {
  /** The entry being edited; null when adding a new one. */
  entry: SpendingEntry | null;
  period: PeriodRange;
  /** Names already used this month, suggested while typing. */
  names: string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [spentOn, setSpentOn] = useState(() => entry?.spent_on ?? defaultSpendDate(period));
  const [personName, setPersonName] = useState(entry?.person_name ?? "");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const input: SpendingInput = {
    spentOn,
    personName: cleanPersonName(personName),
    amount: roundAmount(Number(amount)),
  };
  const dateOk = isValidDateStr(spentOn) && isDateInPeriod(spentOn, period);
  const valid = dateOk && input.personName !== "" && isValidSpendingAmount(input.amount);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = entry ? await updateSpending(entry.id, input) : await addSpending(input);
      if (result.ok) {
        const saved = { spent_on: input.spentOn, person_name: input.personName, amount: input.amount };
        onDone(`${entry ? "Updated" : "Saved"}: ${describe(saved)}.`);
      } else {
        setError(result.error);
      }
    });
  }

  function remove() {
    if (!entry || isPending) return;
    if (!window.confirm(`Delete ${describe(entry)}?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSpending(entry.id);
      if (result.ok) onDone(`Deleted: ${describe(entry)}.`);
      else setError(result.error);
    });
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="spending-dialog-title"
      // Esc: close, unless a save is on its way.
      onCancel={(e) => {
        if (isPending) e.preventDefault();
      }}
      // Closed by the browser (Esc). Ignore the echo of an earlier close
      // arriving after the dialog was opened again.
      onClose={() => {
        if (!ref.current?.open) onClose();
      }}
      // A tap on the dimmed backdrop lands on the <dialog> itself.
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
      className="mx-auto mb-auto mt-16 w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40 sm:my-auto"
    >
      <form onSubmit={save} className="flex flex-col gap-3 p-4">
        <h2 id="spending-dialog-title" className="text-base font-bold text-slate-900">
          {entry ? "Edit spending" : "Add spending"}
        </h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="spendingDate" className="text-xs font-semibold text-slate-500">
            Date
          </label>
          <input
            id="spendingDate"
            type="date"
            required
            min={period.start_date}
            max={periodLastDay(period)}
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
            aria-invalid={!dateOk}
            className={FIELD_CLASS}
          />
          {!dateOk && (
            <p className="text-xs text-red-700">Pick a date inside this mess month.</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="spendingName" className="text-xs font-semibold text-slate-500">
            Person / Name
          </label>
          <input
            id="spendingName"
            type="text"
            required
            maxLength={MAX_PERSON_NAME}
            autoComplete="off"
            list="spending-names"
            placeholder="e.g. Rahim"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            className={FIELD_CLASS}
          />
          <datalist id="spending-names">
            {names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="spendingAmount" className="text-xs font-semibold text-slate-500">
            Spending amount (৳)
          </label>
          <input
            id="spendingAmount"
            type="number"
            inputMode="decimal"
            required
            min="0.01"
            step="0.01"
            placeholder="e.g. 3500"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${FIELD_CLASS} font-semibold`}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={!valid || isPending}
            className="h-11 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save Spending"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-11 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          {entry && (
            <button
              type="button"
              onClick={remove}
              disabled={isPending}
              className="ml-auto h-11 rounded-full border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}

/**
 * The Spend tab: every spending entry of the mess month (Date, Person/Name,
 * Total Spending), a form to add or edit one, and "Sum Spending", which has
 * the database add up the month's entries. Nothing is listed until it's
 * recorded — no blank rows for dates.
 */
export function SpendingManager({
  entries,
  period,
  monthLabel,
}: {
  entries: SpendingEntry[];
  period: PeriodRange;
  /** "September2026 (5 Sep – 4 Oct 2026)" */
  monthLabel: string;
}) {
  // A new key per opening, so each one starts fresh.
  const [dialog, setDialog] = useState<{ key: number; entry: SpendingEntry | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sum, setSum] = useState<{ total: number; entries: number } | null>(null);
  const [sumError, setSumError] = useState<string | null>(null);
  const [isSumming, startSumming] = useTransition();

  const names = [...new Set(entries.map((entry) => entry.person_name))].sort((a, b) =>
    a.localeCompare(b)
  );

  function open(entry: SpendingEntry | null) {
    setNotice(null);
    setDialog((prev) => ({ key: (prev?.key ?? 0) + 1, entry }));
  }

  function runSum() {
    setSumError(null);
    startSumming(async () => {
      const result = await sumSpending();
      if (result.ok) {
        setSum({ total: result.total, entries: result.entries });
      } else {
        setSum(null);
        setSumError(result.error);
      }
    });
  }

  function handleDone(message: string) {
    setDialog(null);
    setNotice(message);
    // A total on screen would now be out of date: add it up again.
    if (sum) runSum();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={() => open(null)}
          className="h-11 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          + Add Spending
        </button>
      </div>

      {notice && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Spending this month ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            No spending recorded for this month yet. Press{" "}
            <span className="font-semibold">+ Add Spending</span> to record one.
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      Person / Name
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                      Total Spending
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => open(entry)}
                      className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50 active:bg-slate-100"
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                        {formatShortDate(entry.spent_on)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-800 [overflow-wrap:anywhere]">
                        {entry.person_name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <span className="align-middle font-semibold tabular-nums text-slate-900">
                          {formatBDT(entry.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(entry);
                          }}
                          aria-label={`Edit or delete ${describe(entry)}`}
                          className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 align-middle text-slate-500 hover:bg-slate-100"
                        >
                          <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">Tap an entry to edit or delete it.</p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={runSum}
          disabled={isSumming}
          className="h-11 w-full rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 sm:w-fit"
        >
          {isSumming ? "Adding up…" : "Sum Spending"}
        </button>
        {sum && (
          <div
            role="status"
            className="rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-inset ring-emerald-200"
          >
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-bold uppercase tracking-wide text-emerald-900">
                Total monthly spending:
              </span>
              <span className="text-2xl font-bold tabular-nums text-emerald-900">
                {formatBDT(sum.total)}
              </span>
            </p>
            <p className="mt-1 text-xs text-emerald-800/80">
              {sum.entries} {sum.entries === 1 ? "entry" : "entries"} · {monthLabel}
            </p>
          </div>
        )}
        {sumError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {sumError}
          </p>
        )}
      </section>

      {dialog && (
        <SpendingDialog
          key={dialog.key}
          entry={dialog.entry}
          period={period}
          names={names}
          onClose={() => setDialog(null)}
          onDone={handleDone}
        />
      )}
    </div>
  );
}
