import { useEffect, useState } from "react";
import { AlertTriangle, CalendarCheck, Car, CircleParking, Clock, MapPinOff, ParkingSquare, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { getSlots, getStatus } from "../api";
import { useAuth } from "../auth";
import { Item, Reveal, Stagger, spring } from "../motion";
import type { Slot, Status } from "../types";
import LiveFeed from "./LiveFeed";
import OccupancyRing from "./OccupancyRing";
import ParkingScene from "./ParkingScene";
import SlotMap from "./SlotMap";
import SourcePanel from "./SourcePanel";
import StatCard from "./StatCard";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export default function Dashboard({ onReserve }: { onReserve: () => void }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [offline, setOffline] = useState(false);

  // ask the backend for fresh data every 2 seconds
  useEffect(() => {
    const load = async () => {
      try {
        const [st, sl] = await Promise.all([getStatus(), getSlots()]);
        setStatus(st);
        setSlots(sl);
        setOffline(false);
      } catch {
        setOffline(true);
      }
    };
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  // counted from the saved slots (MySQL) - still right while the camera is unavailable
  const count = (s: Slot["status"]) => slots.filter((x) => x.status === s).length;
  const total = slots.length;
  const free = count("free");
  const reserved = count("reserved");
  const occupied = count("occupied");
  const isOperator = user?.role === "operator";
  const byName = [...slots].sort((a, b) => a.slot_code.localeCompare(b.slot_code, undefined, { numeric: true }));
  const loading = status === null && !offline; // first load: show grey placeholders

  return (
    <div className="space-y-6">
      {offline && (
        <div className="flex animate-fade-in items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <WifiOff className="size-5 shrink-0" />
          <span>
            Cannot reach the backend at http://localhost:8000. Start it with{" "}
            <code className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-xs dark:bg-rose-500/20">uvicorn main:app --reload --port 8000</code>
          </span>
        </div>
      )}
      {status?.error && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="size-5 shrink-0" /> Camera: {status.error}
        </div>
      )}

      {/* entrance board - looks like the "SPACES FREE" sign at a car park gate */}
      <div className="overflow-hidden rounded-xl bg-stone-900 text-white dark:bg-black">
        <div className="flex flex-wrap items-center gap-6 p-6 sm:p-7">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-stone-400">
              {greeting()}, {user?.full_name.split(" ")[0]}
            </p>
            <h2 className="mt-1 text-2xl font-bold sm:text-[28px]">
              {total === 0 ? "No parking spaces set up yet" : free > 0 ? "Spaces are available" : "The car park is full"}
            </h2>
            <p className="mt-2 max-w-lg text-sm text-stone-400">Counted from the camera every second. A booked space is held for 15 minutes.</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button onClick={onReserve} disabled={free === 0} className="btn bg-paint text-stone-900 hover:bg-yellow-400">
                <CalendarCheck className="size-4" /> Reserve a space
              </button>
              <span className="flex items-center gap-1.5 text-xs text-stone-400">
                <Clock className="size-3.5" /> Last count {status?.last_update ? status.last_update.slice(11) : "-"}
              </span>
            </div>
          </div>

          {/* the board: the number rolls over when it changes */}
          <div className="rounded-lg border-2 border-stone-700 bg-black px-6 py-4 text-center">
            <p className="font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.25em] text-stone-400">SPACES FREE</p>
            <div className="relative mt-1 h-16 min-w-28 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p
                  key={total === 0 ? "none" : free}
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -40, opacity: 0 }}
                  transition={spring}
                  className={`font-mono text-6xl leading-none font-semibold tabular-nums ${
                    free > 0 ? "text-emerald-400 [text-shadow:0_0_14px_rgba(52,211,153,0.45)]" : "text-rose-500 [text-shadow:0_0_14px_rgba(244,63,94,0.45)]"
                  }`}
                >
                  {total === 0 ? "--" : free > 0 ? String(free).padStart(2, "0") : "FULL"}
                </motion.p>
              </AnimatePresence>
            </div>
            <p className="text-xs text-stone-500">of {total} in Lot A</p>
          </div>
        </div>
        {/* live miniature of the lot: cars drive in and out as the camera sees them */}
        <div className="px-4 pb-4 sm:px-6">
          <ParkingScene slots={byName} />
        </div>
        <div className="bay-line" />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card space-y-3 p-4">
              <div className="skeleton h-4 w-20" />
              <div className="skeleton h-8 w-12" />
              <div className="skeleton h-3 w-16" />
            </div>
          ))}
        </div>
      ) : (
      // cards come in one after another
      <Stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Item><StatCard label="Total slots" value={total} icon={<ParkingSquare className="size-5" />} /></Item>
        <Item><StatCard label="Free" value={free} icon={<CircleParking className="size-5" />} tone="emerald" sub="ready to use" /></Item>
        <Item><StatCard label="Reserved" value={reserved} icon={<CalendarCheck className="size-5" />} tone="amber" sub="held for a driver" /></Item>
        <Item><StatCard label="Occupied" value={occupied} icon={<Car className="size-5" />} tone="rose" sub="car parked" /></Item>
        <Item><StatCard label="Vehicles seen" value={status?.cars_detected ?? 0} icon={<Car className="size-5" />} tone="indigo" sub="by YOLO" /></Item>
        <Item><StatCard label="Outside slots" value={status?.cars_outside_slots ?? 0} icon={<MapPinOff className="size-5" />} tone="orange" sub="possible anomaly" /></Item>
      </Stagger>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Reveal className="lg:col-span-2">
          <LiveFeed />
        </Reveal>
        <div className="space-y-6">
          <Reveal delay={0.08}>
            <OccupancyRing free={free} reserved={reserved} occupied={occupied} />
          </Reveal>
          {isOperator && (
            <Reveal delay={0.16}>
              <SourcePanel current={status?.source ?? ""} />
            </Reveal>
          )}
        </div>
      </div>

      <Reveal>
        <SlotMap slots={slots} onReserve={onReserve} />
      </Reveal>
    </div>
  );
}
