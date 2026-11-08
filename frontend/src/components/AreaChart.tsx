// Small line / area chart in plain SVG with a hover read-out (no chart library)
import { useState } from "react";
import { motion } from "motion/react";

export interface Series {
  label: string;
  color: string;
  values: number[];
}

interface Props {
  labels: string[]; // x-axis labels (times), oldest first
  series: Series[];
  height?: number;
}

const W = 600;
const PAD = { top: 12, right: 12, bottom: 24, left: 32 };

export default function AreaChart({ labels, series, height = 220 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  if (n === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-stone-500">No history yet - it is saved every 10 seconds.</div>;
  }

  const ticks = [0, Math.round(max / 2), max];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const i = Math.round(((px - PAD.left) / innerW) * (n - 1));
          setHover(Math.min(n - 1, Math.max(0, i)));
        }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.label} id={`grad-${s.label}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-stone-200 dark:stroke-stone-800" strokeDasharray="4 4" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-stone-400 text-[10px]">
              {t}
            </text>
          </g>
        ))}
        {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-stone-400 text-[10px]">
            {labels[i]}
          </text>
        ))}

        {series.map((s) => {
          const line = s.values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
          return (
            <g key={s.label}>
              <motion.path
                d={`${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`}
                fill={`url(#grad-${s.label})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              />
              {/* the line draws itself from left to right */}
              <motion.path
                d={line}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.1, ease: "easeInOut" }}
              />
            </g>
          );
        })}

        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-stone-300 dark:stroke-stone-600" />
            {series.map((s) => (
              <circle key={s.label} cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill={s.color} stroke="white" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-xl bg-stone-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-stone-700"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > n / 2 ? "-110%" : "10%"})` }}
        >
          <p className="mb-1 font-semibold">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.label} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.label}: <b>{s.values[hover]}</b>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
