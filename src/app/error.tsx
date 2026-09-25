"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:py-8">
      <ErrorPanel {...props} />
    </div>
  );
}
