import type { Metadata } from "next";
import Link from "next/link";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Office Meal Manager",
  description: "Track daily breakfast, lunch, and dinner participation for the office.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4">
            <Link href="/" className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white"
              >
                M
              </span>
              <span className="text-base font-bold tracking-tight text-slate-900">
                Office Meal Manager
              </span>
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
