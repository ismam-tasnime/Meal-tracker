import { MEALS } from "@/lib/meals-client";
import { formatCutoff, type MealCutoffs, type MealLockReason } from "@/lib/utils/cutoffs";

/**
 * Explains the locks above the meals: previous day, or which of today's
 * deadlines have passed (and when the rest close).
 */
export function LockNotice({
  date,
  today,
  reasons,
  cutoffs,
  lockRejected,
}: {
  date: string;
  today: string;
  reasons: MealLockReason[];
  cutoffs: MealCutoffs;
  lockRejected: boolean;
}) {
  if (date < today) {
    return (
      <p className="mb-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
        <span aria-hidden>🔒</span>
        <span>
          <strong>Locked.</strong> Previous days cannot be changed.
        </span>
      </p>
    );
  }
  if (date > today && !lockRejected) return null;

  const passed = MEALS.filter((_, i) => reasons[i] === "deadline_passed");
  const open = MEALS.filter((_, i) => reasons[i] === null);

  return (
    <div className="mb-3 flex flex-col gap-2">
      {(passed.length > 0 || lockRejected) && (
        <p
          role={lockRejected ? "alert" : undefined}
          className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <span aria-hidden>🔒</span>
          <span>
            {passed.length > 0 && (
              <strong>{passed.map((m) => m.label).join(", ")} locked. </strong>
            )}
            The meal selection deadline has passed. Please contact the Mess Manager for
            corrections.
          </span>
        </p>
      )}
      {open.length > 0 && (
        <p className="text-xs text-slate-500">
          Change before:{" "}
          {open.map((m) => `${m.label} ${formatCutoff(cutoffs[m.key])}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
