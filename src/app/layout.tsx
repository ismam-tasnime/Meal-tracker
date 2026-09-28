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
            <Link href="/" aria-label="Meal Tracker home" className="flex shrink-0 items-center gap-2.5">
              <span
                aria-hidden
                className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500 via-indigo-600 to-emerald-500 text-lg font-extrabold text-white shadow-md shadow-indigo-500/30 ring-1 ring-inset ring-white/30 transition-transform active:scale-95"
              >
                M
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-white/80" />
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
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
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
