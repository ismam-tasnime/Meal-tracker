"use client";

type Status = "idle" | "saving" | "error";

export function MealToggleButton({
  label,
  value,
  status,
  onToggle,
  locked = false,
}: {
  label: string;
  value: boolean;
  status: Status;
  onToggle: () => void;
  /** Employee deadline passed: still shows ON/OFF, but can't be tapped. */
  locked?: boolean;
}) {
  if (locked) {
    return (
      <button
        type="button"
        disabled
        className={[
          "flex h-9 w-full min-w-[3.75rem] cursor-not-allowed items-center justify-center gap-1 rounded-full text-xs font-semibold sm:text-sm",
          value
            ? "bg-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200"
            : "bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-200",
        ].join(" ")}
        aria-label={`${label}: ${value ? "ON" : "OFF"} (locked)`}
        title="Locked"
      >
        <span aria-hidden>🔒</span>
        {value ? "ON" : "OFF"}
      </button>
    );
  }

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
