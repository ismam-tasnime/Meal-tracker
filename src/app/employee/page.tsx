import { redirect } from "next/navigation";
import { DateNav } from "@/components/public/DateNav";
import { MyMeals } from "@/components/employee/MyMeals";
import { MyMonth } from "@/components/employee/MyMonth";
import { LoadError } from "@/components/LoadError";
import { RetryButton } from "@/components/RetryButton";
import { getEmployeeSession, type EmployeeSession } from "@/lib/auth/employee-session";
import { EmployeeSignOutButton } from "@/components/employee/EmployeeSignOutButton";
import { getMealCutoffs } from "@/lib/data/meals";
import { getMyMeals, getMyMonthMeals, getMyStatement } from "@/lib/data/statement";
import { formatCutoff } from "@/lib/utils/cutoffs";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";
import { messMonthOf, parseMessMonthParam } from "@/lib/utils/mess";

export const dynamic = "force-dynamic";

export default async function EmployeePanelPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; month?: string }>;
}) {
  const { date: rawDate, month: rawMonth } = await searchParams;
  const date = isValidDateStr(rawDate) ? rawDate : todayInOfficeTz();
  const month = parseMessMonthParam(rawMonth) ?? messMonthOf(todayInOfficeTz());

  let session: EmployeeSession | null = null;
  try {
    session = await getEmployeeSession();
  } catch (error) {
    console.error("getEmployeeSession failed", error);
  }

  // Defense in depth: the proxy already sends signed-out visitors to login.
  if (session && !session.user) redirect("/employee/login");

  const employee = session?.employee ?? null;
  if (!employee || !employee.is_active) {
    const loadFailed = session === null;
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 text-center">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          {loadFailed
            ? "Can’t load your account"
            : employee
              ? "Account deactivated"
              : "Not an employee account"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {loadFailed
            ? "The connection to the database failed. Check your internet and try again."
            : employee
              ? "Your employee account has been deactivated. Please contact the mess manager."
              : "This login isn’t linked to an employee. Sign out and sign in with your phone number."}
        </p>
        {loadFailed && (
          <div className="mt-4">
            <RetryButton />
          </div>
        )}
        <div className="mt-4">
          <EmployeeSignOutButton className="h-10 rounded-full border border-slate-300 px-4 text-sm font-semibold text-slate-700" />
        </div>
      </div>
    );
  }

  let loadError: string | null = null;
  let meals: Awaited<ReturnType<typeof getMyMeals>> | null = null;
  let statement: Awaited<ReturnType<typeof getMyStatement>> = null;
  let monthDays: Awaited<ReturnType<typeof getMyMonthMeals>> = [];
  // getMealCutoffs never throws (falls back to defaults), so it can't fail the page.
  const cutoffsPromise = getMealCutoffs();
  try {
    [meals, statement, monthDays] = await Promise.all([
      getMyMeals(employee.id, date),
      getMyStatement(month),
      getMyMonthMeals(month),
    ]);
  } catch (err) {
    console.error("Failed to load the Employee Panel", err);
    loadError = "Could not load your meals.";
  }
  const cutoffs = await cutoffsPromise;
  // Server Component, rendered once per request (force-dynamic): this is the
  // request's time, which the on-screen lock clock follows.
  // eslint-disable-next-line react-hooks/purity
  const serverNow = Date.now();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-5 sm:py-8">
      <header className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {/* The token number as a soft tile; the name's first letter if there's no token. */}
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-linear-to-br from-indigo-50 to-emerald-50 ring-1 ring-inset ring-indigo-100">
          {employee.token_no !== null ? (
            <>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-indigo-400">
                Token
              </span>
              <span className="text-lg font-bold leading-tight tabular-nums text-indigo-700">
                {employee.token_no}
              </span>
            </>
          ) : (
            <span className="text-xl font-bold text-indigo-600">
              {employee.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            {employee.name}
          </h1>
          <p className="text-xs tabular-nums text-slate-500">{employee.phone}</p>
        </div>
        <EmployeeSignOutButton className="h-9 shrink-0 rounded-full border border-slate-300 px-3 text-sm font-semibold text-slate-700" />
      </header>

      {loadError || !meals ? (
        <LoadError message={loadError ?? "Could not load your meals."} />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">My meals</h2>
              <p className="text-xs text-slate-500">
                Tap a meal to switch it ON or OFF. Saves instantly. Past days can&rsquo;t be changed.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Deadlines (set by the mess manager): Breakfast {formatCutoff(cutoffs.breakfast)} ·
                Lunch {formatCutoff(cutoffs.lunch)} · Dinner {formatCutoff(cutoffs.dinner)}
              </p>
            </div>
            <DateNav date={date} basePath="/employee" />
            <MyMeals
              key={date}
              employeeId={employee.id}
              date={date}
              initial={meals}
              cutoffs={cutoffs}
              serverNow={serverNow}
            />
          </section>

          {statement && (
            <MyMonth
              employeeId={employee.id}
              month={month}
              date={date}
              statement={statement}
              days={monthDays}
              cutoffs={cutoffs}
              serverNow={serverNow}
            />
          )}
        </>
      )}
    </div>
  );
}
