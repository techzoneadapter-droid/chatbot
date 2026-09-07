import { clsx } from "clsx";

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "hot" | "warm" | "good" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-2 py-1 text-xs font-semibold",
        tone === "neutral" && "bg-slate-100 text-slate-700",
        tone === "hot" && "bg-red-100 text-red-700",
        tone === "warm" && "bg-amber-100 text-amber-800",
        tone === "good" && "bg-emerald-100 text-emerald-700"
      )}
    >
      {children}
    </span>
  );
}
