"use client";

type Status = "idle" | "saving" | "error";

export function MealToggleButton({
  label,
  value,
  status,
  onToggle,
}: {
  label: string;
  value: boolean;
  status: Status;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={status === "saving"}
      className={[
        "flex h-9 w-full min-w-[3.75rem] items-center justify-center rounded-full text-xs font-semibold transition-colors sm:text-sm",
        "disabled:cursor-wait disabled:opacity-70",
        value
          ? "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800"
          : "bg-slate-100 text-slate-500 hover:bg-slate-200 active:bg-slate-300",
        status === "error" ? "ring-2 ring-red-500" : "",
      ].join(" ")}
      aria-pressed={value}
      aria-label={`${label}: ${value ? "ON" : "OFF"}`}
      title={status === "error" ? "Save failed — tap to retry" : undefined}
    >
      {status === "saving" ? "…" : value ? "ON" : "OFF"}
    </button>
  );
}
