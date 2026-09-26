"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/employee", label: "Employee Panel" },
  { href: "/admin", label: "Mess Manager" },
];

/**
 * Top-level switch between the two panels, always visible in the header. The
 * landing page ("/") is the read-only meal board, so neither tab is active there.
 */
export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {TABS.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "flex h-9 items-center whitespace-nowrap rounded-lg px-3 text-sm transition-colors",
              isActive
                ? "bg-slate-100 font-semibold text-slate-900"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
