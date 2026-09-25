"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { signOut } from "@/lib/actions/auth";

const LINKS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/meals", label: "Meal Status" },
  { href: "/admin/expenses", label: "Expense Status" },
  { href: "/admin/reports", label: "Report" },
  { href: "/admin/employees", label: "Employees" },
];

const ITEM =
  "flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg px-2.5 text-sm transition-colors";
const ITEM_IDLE = "text-slate-600 hover:bg-slate-100 hover:text-slate-900";
const ITEM_ACTIVE = "bg-slate-100 font-semibold text-slate-900";

/**
 * Mess manager navigation. A plain, compact sidebar on desktop (links on
 * top, account + sign out pinned to the bottom); a single scrollable row on
 * phones.
 */
export function AdminNav({ accountName, periodRange }: { accountName: string; periodRange: string }) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <aside className="sticky top-14 z-20 border-b border-slate-200 bg-white sm:flex sm:h-[calc(100dvh-3.5rem)] sm:w-60 sm:shrink-0 sm:flex-col sm:border-b-0 sm:border-r">
      <nav className="flex gap-0.5 overflow-x-auto px-2 py-2 sm:flex-1 sm:flex-col sm:overflow-y-auto sm:px-3 sm:py-3">
        {LINKS.map((link) => {
          const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className={`${ITEM} ${isActive ? ITEM_ACTIVE : ITEM_IDLE}`}
            >
              {link.label}
            </Link>
          );
        })}
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => signOut())}
          className={`${ITEM} ${ITEM_IDLE} disabled:opacity-60 sm:hidden`}
        >
          {isPending ? "Signing out…" : "Sign out"}
        </button>
      </nav>

      <div className="hidden border-t border-slate-200 px-3 py-3 sm:block">
        <div className="px-2.5 pb-2">
          <p className="truncate text-sm font-semibold text-slate-900">{accountName}</p>
          <p className="text-xs text-slate-500">{periodRange}</p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => signOut())}
          className={`${ITEM} ${ITEM_IDLE} w-full disabled:opacity-60`}
        >
          {isPending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
