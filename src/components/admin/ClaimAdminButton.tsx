"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claimAdminAccess } from "@/lib/actions/auth";

export function ClaimAdminButton({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClaim() {
    setError(null);
    startTransition(async () => {
      const result = await claimAdminAccess(defaultName);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClaim}
        disabled={isPending}
        className="h-11 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
      >
        {isPending ? "Granting access…" : "Claim admin access"}
      </button>
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
