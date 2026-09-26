import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:py-8">
      <PageSkeleton message="Loading employees…" rows={8} />
    </div>
  );
}
