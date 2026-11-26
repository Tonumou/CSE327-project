// Donut chart: share of free / reserved / occupied slots (plain SVG, no chart library)
import { motion } from "motion/react";
interface Props {
  free: number;
  reserved: number;
  occupied: number;
}

const R = 52;
const CIRCLE = 2 * Math.PI * R;

export default function OccupancyRing({ free, reserved, occupied }: Props) {
  const total = free + reserved + occupied;
  const parts = [
    { label: "Free", value: free, color: "#10b981" },
    { label: "Reserved", value: reserved, color: "#f59e0b" },
    { label: "Occupied", value: occupied, color: "#f43f5e" },
  ];
  const busy = total ? Math.round(((occupied + reserved) / total) * 100) : 0;
  let offset = 0;

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Occupancy</h2>
      <p className="text-xs text-stone-500 dark:text-stone-400">Share of all parking spaces right now</p>
      <div className="mt-4 flex items-center gap-6">
        <div className="relative size-36 shrink-0">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" strokeWidth="14" className="stroke-stone-100 dark:stroke-stone-800" />
            {total > 0 &&
              parts.map((p) => {
                const length = (p.value / total) * CIRCLE;
                const el = (
                  <motion.circle
                    key={p.label}
                    cx="60"
                    cy="60"
                    r={R}
                    fill="none"
                    stroke={p.color}
                    strokeWidth="14"
                    initial={{ strokeDasharray: `0 ${CIRCLE}`, strokeDashoffset: 0 }}
                    animate={{ strokeDasharray: `${length} ${CIRCLE - length}`, strokeDashoffset: -offset }}
                    transition={{ type: "spring", stiffness: 90, damping: 20 }}
                  >
                    <title>{`${p.label}: ${p.value}`}</title>
                  </motion.circle>
                );
                offset += length;
                return el;
              })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-extrabold tabular-nums">{busy}%</span>
            <span className="text-xs text-stone-500">in use</span>
          </div>
        </div>
        <ul className="flex-1 space-y-2.5 text-sm">
          {parts.map((p) => (
            <li key={p.label} className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: p.color }} />
              <span className="text-stone-600 dark:text-stone-300">{p.label}</span>
              <span className="ml-auto font-bold tabular-nums">{p.value}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 border-t border-stone-100 pt-2.5 dark:border-stone-800">
            <span className="text-stone-500">Total</span>
            <span className="ml-auto font-bold tabular-nums">{total}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
