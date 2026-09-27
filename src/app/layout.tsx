import type { Metadata } from "next";
import Link from "next/link";
import { DM_Sans } from "next/font/google";
import { HeaderNav } from "@/components/HeaderNav";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meal Tracker",
  description: "Track daily breakfast, lunch, and dinner participation for the office.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
          <div className="flex h-14 w-full items-center justify-between gap-2 px-4">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span
                aria-hidden
                className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white"
              >
                M
              </span>
              <span className="hidden text-base font-bold tracking-tight text-slate-900 sm:inline">
                Meal Tracker
              </span>
            </Link>
            <HeaderNav />
          </div>
        </header>
        {children}
        <footer className="mt-auto px-4 pb-6 pt-8">
          <p className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white/80 py-1.5 pl-1.5 pr-4 text-xs text-slate-500 shadow-sm ring-1 ring-indigo-100 backdrop-blur">
            <span
              aria-hidden
              className="flex h-6 w-6 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-emerald-400 text-[11px] font-bold text-white shadow-sm"
            >
              R
            </span>
            <span>Developed by</span>
            <span className="bg-linear-to-r from-indigo-600 via-violet-500 to-emerald-500 bg-clip-text text-sm font-bold tracking-tight text-transparent">
              Romith
            </span>
          </p>
        </footer>
      </body>
    </html>
  );
}
