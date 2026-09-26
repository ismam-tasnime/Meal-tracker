"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/employee",
    label: "Employee Panel",
    // Person
    icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
    active: "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-indigo-600",
    idle: "bg-indigo-50 text-indigo-700 ring-indigo-200 hover:bg-indigo-100",
  },
  {
    href: "/admin",
    label: "Mess Manager",
    // Clipboard with a tick
    icon: "M9 4h6v3H9zM7 5.5H5.5v15h13v-15H17M9 13.5l2 2 4-4",
    active: "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-emerald-600",
    idle: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100",
  },
];

/**
 * Top-level switch between the two panels, always visible in the header. The
 * landing page ("/") is the read-only meal board, so neither tab is active there.
 */
export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      {TABS.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "flex h-10 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[13px] font-semibold ring-1 transition-all active:scale-95 sm:gap-1.5 sm:px-3.5 sm:text-sm",
              isActive ? tab.active : tab.idle,
            ].join(" ")}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
