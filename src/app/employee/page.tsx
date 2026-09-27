import { redirect } from "next/navigation";
import { DateNav } from "@/components/public/DateNav";
import { MyMeals } from "@/components/employee/MyMeals";
import { MyBill } from "@/components/employee/MyBill";
import { EmployeeName } from "@/components/EmployeeName";
import { LoadError } from "@/components/LoadError";
import { RetryButton } from "@/components/RetryButton";
import { getEmployeeSession, type EmployeeSession } from "@/lib/auth/employee-session";
import { signOutEmployee } from "@/lib/actions/employee-auth";
import { getMealCutoffs } from "@/lib/data/meals";
import { getMyMeals, getMyStatement } from "@/lib/data/statement";
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
        <form action={signOutEmployee} className="mt-4">
          <button
            type="submit"
            className="h-10 rounded-full border border-slate-300 px-4 text-sm font-semibold text-slate-700"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  }

  let loadError: string | null = null;
  let meals: Awaited<ReturnType<typeof getMyMeals>> | null = null;
  let statement: Awaited<ReturnType<typeof getMyStatement>> = null;
  // getMealCutoffs never throws (falls back to defaults), so it can't fail the page.
  const cutoffsPromise = getMealCutoffs();
  try {
    [meals, statement] = await Promise.all([
      getMyMeals(employee.id, date),
      getMyStatement(month),
    ]);
  } catch (err) {
    console.error("Failed to load the Employee Panel", err);
    loadError = "Could not load your meals.";
  }
  const cutoffs = await cutoffsPromise;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-5 sm:py-8">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            <EmployeeName name={employee.name} tokenNo={employee.token_no} />
          </h1>
          <p className="text-xs text-slate-500">{employee.phone}</p>
        </div>
        <form action={signOutEmployee}>
          <button
            type="submit"
            className="h-9 shrink-0 rounded-full border border-slate-300 px-3 text-sm font-semibold text-slate-700"
          >
            Sign out
          </button>
        </form>
      </header>

      {loadError || !meals ? (
        <LoadError message={loadError ?? "Could not load your meals."} />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">My meals</h2>
              <p className="text-xs text-slate-500">Tap a meal to switch it ON or OFF. Saves instantly.</p>
            </div>
            <DateNav date={date} basePath="/employee" />
            <MyMeals
              key={date}
              employeeId={employee.id}
              date={date}
              initial={meals}
              cutoffs={cutoffs}
              // Server Component, rendered once per request (force-dynamic): this
              // is the request's time, which the lock clock follows.
              // eslint-disable-next-line react-hooks/purity
              serverNow={Date.now()}
            />
          </section>

          {statement && (
            <section className="flex flex-col gap-3">
              <h2 className="text-base font-bold text-slate-900">My bill</h2>
              <MyBill month={month} statement={statement} date={date} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
