import { PageSkeleton } from "@/components/PageSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-8 sm:py-8">
      <PageSkeleton message="Opening Mess Manager…" />
    </div>
  );
}
