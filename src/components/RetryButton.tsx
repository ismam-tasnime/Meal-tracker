"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Re-runs the current page's server data fetch without a full browser
 * reload. `onRetry` lets error boundaries also reset their own state.
 */
export function RetryButton({ onRetry, label = "Try again" }: { onRetry?: () => void; label?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(() => {
          router.refresh();
          onRetry?.();
        })
      }
      className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-60"
    >
      {isPending ? "Retrying…" : label}
    </button>
  );
}
