/**
 * Shown by route loading boundaries while a page's data loads, so
 * navigation responds instantly instead of showing a blank screen.
 */
export function PageSkeleton({ message, rows = 6 }: { message: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-2">
        <div className="h-5 w-40 animate-pulse rounded-md bg-slate-200" />
        <p className="text-sm text-slate-500" role="status">
          {message}
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0">
            <div className="h-5 w-8 animate-pulse rounded-md bg-slate-100" />
            <div className="h-4 flex-1 animate-pulse rounded-md bg-slate-100" />
            <div className="h-8 w-16 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
