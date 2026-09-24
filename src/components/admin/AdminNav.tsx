"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { signOut } from "@/lib/actions/auth";

const LINKS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/meals", label: "Meals" },
  { href: "/admin/prices", label: "Prices" },
  { href: "/admin/reports", label: "Reports" },
];

export function AdminNav() {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto px-1 py-1 sm:flex-col sm:items-stretch sm:gap-0.5 sm:overflow-visible sm:px-0">
      {LINKS.map((link) => {
        const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={[
              "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100 sm:text-slate-700",
            ].join(" ")}
          >
            {link.label}
          </Link>
        );
      })}
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => signOut())}
        className="ml-auto whitespace-nowrap rounded-full px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-60 sm:ml-0 sm:mt-4"
      >
        {isPending ? "Signing out…" : "Sign out"}
      </button>
    </nav>
  );
}
