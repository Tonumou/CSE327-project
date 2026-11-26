// A small top-down drawing of the car park that follows the real slots:
// - occupied slot  -> a parked car; a NEW one drives in through the barrier and turns into its bay
// - slot set free  -> its car reverses out and drives to the exit
// - reserved slot  -> a traffic cone keeps the bay
// - now and then a car drives through the lane so the picture is never frozen
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Slot } from "../types";
import Car, { CAR_COLORS, carColor } from "./Car";

// drawing size in "scene pixels" (the whole scene is scaled to fit the card)
const BAY_W = 64;
const BAY_TOP = 22;
const BAY_H = 100;
const LANE_TOP = BAY_TOP + BAY_H; // driving lane starts under the bays
const LANE_Y = LANE_TOP + 42; // middle of the lane
const H = 232;
const KERB = H - 24; // pavement at the bottom
const START_X = 132; // bays start after the entrance
const GATE_X = 104; // barrier position
const MAX_BAYS = 12;
const PARK_Y = BAY_TOP + BAY_H / 2 + 4;

function Cone() {
  return (
    <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true">
      <ellipse cx="11" cy="23" rx="10" ry="3" fill="#000" opacity="0.3" />
      <path d="M11 2 L18 22 L4 22 Z" fill="#f97316" />
      <path d="M8.2 10 L13.8 10 L15 14 L7 14 Z" fill="#fff" />
      <rect x="2" y="21" width="18" height="3" rx="1" fill="#ea580c" />
    </svg>
  );
}

// wrapper that puts the centre of a car at (x, y) and rotates it around its centre
const carBox = "absolute top-0 left-0 -mt-[13px] -ml-[25px] h-[26px] w-[50px]";

export default function ParkingScene({ slots }: { slots: Slot[] }) {
  const shown = slots.slice(0, MAX_BAYS);
  const bays = shown.length || 8;
  const minW = START_X + bays * BAY_W + 96; // smallest width that fits every bay
  const bayX = (i: number) => START_X + i * BAY_W + BAY_W / 2;

  // ---- fit the drawing to the card: shrink on phones, otherwise widen the lane ----
  const outer = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(minW);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1.15, boxWidth / minW);
  const W = Math.max(minW, boxWidth / scale); // scene width in scene pixels
  const verge = { x: START_X + bays * BAY_W + 18, end: W - 70 }; // planted strip after the bays

  // ---- barrier arm ----
  const [gateOpen, setGateOpen] = useState(false);
  const gateTimer = useRef<number | undefined>(undefined);
  const openGate = (delayMs: number) => {
    window.setTimeout(() => {
      setGateOpen(true);
      window.clearTimeout(gateTimer.current);
      gateTimer.current = window.setTimeout(() => setGateOpen(false), 1500);
    }, delayMs);
  };

  // ---- which parked cars are new (they drive in) and which were already there ----
  const parkedIds = shown.filter((s) => s.status === "occupied").map((s) => s.id);
  const known = useRef<Set<number> | null>(null);
  const arriving = useRef<Set<number>>(new Set());
  const newArrival = useRef(false);
  const [, parked] = useState(0); // re-draw when a car has finished parking (lights off)
  if (known.current === null) {
    // first real data: everything already occupied is simply parked (no drive-in)
    if (slots.length > 0) known.current = new Set(parkedIds);
  } else {
    for (const id of parkedIds) {
      if (!known.current.has(id)) {
        known.current.add(id);
        arriving.current.add(id);
        newArrival.current = true;
      }
    }
    for (const id of [...known.current]) if (!parkedIds.includes(id)) known.current.delete(id);
  }
  const key = parkedIds.join(",");
  useEffect(() => {
    if (newArrival.current) {
      newArrival.current = false;
      openGate(550); // the arriving car stops at the barrier first
    }
  }, [key]);

  // ---- passing traffic ----
  const [passers, setPassers] = useState<{ id: number; color: string }[]>([]);
  useEffect(() => {
    const send = () => {
      if (document.hidden) return;
      setPassers((p) => [...p, { id: Date.now(), color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] }]);
      openGate(1000);
    };
    const first = window.setTimeout(send, 1200);
    const every = window.setInterval(send, 9000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);

  return (
    <div ref={outer} className="w-full overflow-hidden" style={{ height: H * scale }}>
      <div className="relative origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        {/* ---------- the ground ---------- */}
        <svg width={W} height={H} className="absolute inset-0" aria-hidden="true">
          <defs>
            <pattern id="arm" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="16" fill="#dc2626" />
              <rect x="8" width="8" height="16" fill="#fafaf9" />
            </pattern>
          </defs>
          <rect width={W} height={H} rx="8" fill="#2c2826" />
          {/* planted verge with a few trees where there are no bays */}
          {verge.end - verge.x > 60 && (
            <g>
              <rect x={verge.x} y={BAY_TOP + 6} width={verge.end - verge.x} height={BAY_H - 12} rx="6" fill="#1f3a2a" />
              {Array.from({ length: Math.floor((verge.end - verge.x) / 70) }, (_, i) => {
                const cx = verge.x + 35 + i * 70;
                const cy = BAY_TOP + 50 + (i % 2 ? 14 : -10);
                return (
                  <g key={i}>
                    <circle cx={cx + 4} cy={cy + 5} r="22" fill="#000" opacity="0.25" />
                    <circle cx={cx} cy={cy} r="22" fill="#2f5d3a" />
                    <circle cx={cx - 6} cy={cy - 6} r="12" fill="#3c7449" />
                  </g>
                );
              })}
            </g>
          )}
          <rect width={W} height={BAY_TOP} fill="#3f3a37" />
          <rect y={KERB} width={W} height={H - KERB} fill="#3f3a37" />

          {/* bays: white lines and the slot code painted at the front */}
          <line x1={START_X} x2={START_X + bays * BAY_W} y1={BAY_TOP} y2={BAY_TOP} stroke="#d6d3d1" strokeWidth="2" />
          {Array.from({ length: bays + 1 }, (_, i) => (
            <line key={i} x1={START_X + i * BAY_W} x2={START_X + i * BAY_W} y1={BAY_TOP} y2={LANE_TOP} stroke="#d6d3d1" strokeWidth="2" />
          ))}
          {shown.map((s, i) => (
            <text key={s.id} x={bayX(i)} y={LANE_TOP - 8} textAnchor="middle" fontSize="11" fontFamily="IBM Plex Mono, monospace" fill="#d6d3d1" opacity="0.55">
              {s.slot_code}
            </text>
          ))}
          {shown.map((s, i) =>
            s.status === "reserved" ? (
              <text key={`r${s.id}`} x={bayX(i)} y={BAY_TOP + 18} textAnchor="middle" fontSize="8" fontWeight="700" letterSpacing="1" fill="#f2b705" opacity="0.8">
                RESERVED
              </text>
            ) : null
          )}

          {/* lane: yellow centre line, painted arrow and IN / EXIT words */}
          <line x1="0" x2={W} y1={LANE_Y} y2={LANE_Y} stroke="#f2b705" strokeWidth="2" strokeDasharray="14 10" opacity="0.7" />
          <line x1="0" x2={W} y1={KERB} y2={KERB} stroke="#d6d3d1" strokeWidth="2" opacity="0.6" />
          <path d={`M30 ${LANE_Y + 22} h26 v-6 l12 10 l-12 10 v-6 h-26 z`} fill="#e7e5e4" opacity="0.35" />
          <text x="22" y={LANE_Y - 16} fontSize="12" fontWeight="700" fill="#e7e5e4" opacity="0.4" fontFamily="Archivo, sans-serif">IN</text>
          <text x={W - 56} y={LANE_Y - 16} fontSize="12" fontWeight="700" fill="#e7e5e4" opacity="0.4" fontFamily="Archivo, sans-serif">EXIT</text>

          {/* ticket booth */}
          <rect x={GATE_X - 30} y={KERB + 2} width="24" height="18" rx="2" fill="#57534e" />
          <rect x={GATE_X - 26} y={KERB + 5} width="16" height="6" rx="1" fill="#7dd3fc" opacity="0.6" />
          {/* barrier arm: swings up to let a car in */}
          <motion.rect
            x={GATE_X - 3}
            y={LANE_TOP + 6}
            width="6"
            height={KERB - LANE_TOP - 6}
            rx="2"
            fill="url(#arm)"
            style={{ originX: 0.5, originY: 1 }} // pivot = bottom of the arm, next to the booth
            animate={{ rotate: gateOpen ? -90 : 0 }} // folds away over the booth side
            transition={{ type: "spring", stiffness: 120, damping: 16 }}
          />
          <circle cx={GATE_X} cy={KERB} r="5" fill="#a8a29e" />
        </svg>

        {/* ---------- reserved bays get a cone ---------- */}
        <AnimatePresence>
          {shown.map((s, i) =>
            s.status === "reserved" ? (
              <motion.div
                key={`cone${s.id}`}
                className="absolute"
                style={{ left: bayX(i) - 11, top: PARK_Y - 10 }}
                initial={{ y: -30, opacity: 0, rotate: -20 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: -20, opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 260, damping: 14 }}
              >
                <Cone />
              </motion.div>
            ) : null
          )}
        </AnimatePresence>

        {/* ---------- parked cars ---------- */}
        <AnimatePresence>
          {shown.map((s, i) => {
            if (s.status !== "occupied") return null;
            const x = bayX(i);
            const driveIn = arriving.current.has(s.id);
            return (
              <motion.div
                key={`car${s.id}`}
                className={carBox}
                // already parked when the page opened: no animation; a new car starts at the entrance
                initial={driveIn ? { x: -50, y: LANE_Y + 14, rotate: 0 } : false}
                animate={
                  driveIn
                    ? {
                        // enter, stop at the barrier, drive down the lane, swing into the bay
                        x: [-50, GATE_X - 34, GATE_X - 34, x - 36, x - 8, x],
                        y: [LANE_Y + 14, LANE_Y + 14, LANE_Y + 14, LANE_Y + 14, LANE_Y - 18, PARK_Y],
                        rotate: [0, 0, 0, 0, -48, -90],
                      }
                    : { x, y: PARK_Y, rotate: -90 }
                }
                transition={driveIn ? { duration: 4.2, times: [0, 0.14, 0.3, 0.68, 0.84, 1], ease: "easeInOut" } : { duration: 0 }}
                onAnimationComplete={() => {
                  if (arriving.current.delete(s.id)) parked((n) => n + 1);
                }}
                exit={{
                  // reverse out of the bay, turn, drive to the exit
                  x: [x, x, x + 22, W + 60],
                  y: [PARK_Y, LANE_TOP + 8, LANE_Y - 14, LANE_Y - 14],
                  rotate: [-90, -90, 0, 0],
                  transition: { duration: 3.4, times: [0, 0.32, 0.5, 1], ease: "easeInOut" },
                }}
              >
                <Car color={carColor(s.id)} lights={driveIn} braking={driveIn} />
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* ---------- passing traffic ---------- */}
        {passers.map((p) => (
          <motion.div
            key={p.id}
            className={carBox}
            initial={{ x: -50, y: LANE_Y + 14 }}
            animate={{ x: [-50, GATE_X - 34, GATE_X - 34, W + 60] }}
            transition={{ duration: 6.5, times: [0, 0.18, 0.32, 1], ease: "easeInOut" }}
            onAnimationComplete={() => setPassers((list) => list.filter((q) => q.id !== p.id))}
          >
            <Car color={p.color} lights />
          </motion.div>
        ))}

        {slots.length === 0 && (
          <div className="absolute inset-x-0 top-8 text-center text-sm text-stone-400">Mark the parking bays in Slot Setup to see them here.</div>
        )}
        {slots.length > MAX_BAYS && (
          <div className="absolute top-1 right-3 font-mono text-[11px] text-stone-400">+{slots.length - MAX_BAYS} more bays</div>
        )}
      </div>
    </div>
  );
}
