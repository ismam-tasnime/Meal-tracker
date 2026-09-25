import { RetryButton } from "@/components/RetryButton";

/** Inline "couldn't load" message with a retry that refetches just this page. */
export function LoadError({ message }: { message: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-red-50 px-3 py-2">
      <p className="flex-1 text-sm text-red-700" role="alert">
        {message}
      </p>
      <RetryButton />
    </div>
  );
}
