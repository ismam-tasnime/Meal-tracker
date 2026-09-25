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
          <div className="flex h-14 w-full items-center justify-between gap-3 px-4">
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
      </body>
    </html>
  );
}
