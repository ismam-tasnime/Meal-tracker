"use client";

import { RetryButton } from "@/components/RetryButton";

/** Body of a route error boundary: says what failed and retries in place. */
export function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error(error);
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm text-red-700" role="alert">
        Something went wrong while loading this page — usually a dropped connection. Your saved data
        is safe.
      </p>
      <RetryButton onRetry={reset} />
    </div>
  );
}
