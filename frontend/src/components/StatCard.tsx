import type { ReactNode } from "react";
import { useCountUp } from "../useCountUp";

export type Tone = "slate" | "emerald" | "amber" | "rose" | "indigo" | "orange";

const TONES: Record<Tone, { icon: string; value: string }> = {
  slate: { icon: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300", value: "" },
  emerald: { icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400", value: "text-emerald-600 dark:text-emerald-400" },
  amber: { icon: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400", value: "text-amber-600 dark:text-amber-400" },
  rose: { icon: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400", value: "text-rose-600 dark:text-rose-400" },
  indigo: { icon: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400", value: "text-brand-600 dark:text-brand-400" },
  orange: { icon: "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400", value: "text-orange-600 dark:text-orange-400" },
};

interface Props {
  label: string;
  value: number | string;
  icon: ReactNode;
  tone?: Tone;
  sub?: string; // small line under the number
}

export default function StatCard({ label, value, icon, tone = "slate", sub }: Props) {
  const t = TONES[tone];
  const animated = useCountUp(typeof value === "number" ? value : 0);
  return (
    <div className="card group p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-stone-500 dark:text-stone-400">{label}</p>
        <span className={`flex size-9 items-center justify-center rounded-xl transition group-hover:scale-110 ${t.icon}`}>
          {icon}
        </span>
      </div>
      <p className={`mt-2 text-3xl font-extrabold tracking-tight tabular-nums ${t.value}`}>{typeof value === "number" ? animated : value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-400">{sub}</p>}
    </div>
  );
}
