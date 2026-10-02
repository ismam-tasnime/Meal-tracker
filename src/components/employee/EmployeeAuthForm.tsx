"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signInEmployee, signUpEmployee } from "@/lib/actions/employee-auth";
import { MAX_EMPLOYEE_ID } from "@/lib/utils/employee-id";

const INPUT_CLASS =
  "h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const LABEL_CLASS = "text-sm font-semibold text-slate-700";

/** One labelled text box, with an optional hint under it. */
function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/**
 * Employee sign-in (Employee ID + password) and sign-up (full name, Token
 * Number, Employee ID, phone number and a password, twice).
 *
 * The Token Number is only asked for at sign-up: it is checked against the
 * mess manager's employee list and is what attaches the new account to that
 * employee record. Signing in afterwards uses the Employee ID.
 */
export function EmployeeAuthForm({ mode, next = "/employee" }: { mode: "login" | "signup"; next?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSignup = mode === "signup";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSignup && password !== confirmPassword) {
      setError("Password and Confirm Password do not match.");
      return;
    }

    startTransition(async () => {
      const result = isSignup
        ? await signUpEmployee({ name, token, employeeId, phone, password, confirmPassword })
        : await signInEmployee(employeeId, password);
      if (result.ok) {
        // replace() fetches the page fresh; no extra refresh() needed.
        router.replace(next);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {isSignup && (
        <Field id="name" label="Full name">
          <input
            id="name"
            type="text"
            required
            maxLength={80}
            autoComplete="name"
            placeholder="Md. Rahim Uddin"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      )}

      {isSignup && (
        <Field
          id="token"
          label="Token Number"
          hint="The number the mess manager has on the employee list."
        >
          <input
            id="token"
            type="text"
            required
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="12"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      )}

      <Field
        id="employeeId"
        label="Employee ID"
        hint={isSignup ? "You will sign in with this. Letters, numbers, - and _." : undefined}
      >
        <input
          id="employeeId"
          type="text"
          required
          maxLength={MAX_EMPLOYEE_ID}
          autoComplete="username"
          placeholder="EMP-1024"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      {isSignup && (
        <Field id="phone" label="Phone number" hint="Your mobile number, like 01712345678.">
          <input
            id="phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="01712345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      )}

      <Field id="password" label="Password" hint={isSignup ? "At least 6 characters." : undefined}>
        <input
          id="password"
          type="password"
          required
          minLength={isSignup ? 6 : undefined}
          autoComplete={isSignup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      {isSignup && (
        <Field id="confirmPassword" label="Confirm password">
          <input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-11 rounded-full bg-indigo-600 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:bg-indigo-700 disabled:opacity-60"
      >
        {isSignup
          ? isPending ? "Creating account…" : "Create account"
          : isPending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-xs text-slate-500">
        {isSignup ? "Already have an account? " : "First time here? "}
        <Link
          href={isSignup ? "/employee/login" : "/employee/signup"}
          className="font-semibold text-indigo-600"
        >
          {isSignup ? "Sign in" : "Create your account"}
        </Link>
      </p>
    </form>
  );
}
