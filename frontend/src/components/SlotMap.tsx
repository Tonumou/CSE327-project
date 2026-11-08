import { useState } from "react";
import { Accessibility, Car, Search, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { spring } from "../motion";
import { usePrefs } from "../prefs";
import type { Slot } from "../types";

type Filter = "all" | Slot["status"];

const LOOK: Record<Slot["status"], { tile: string; dot: string; label: string }> = {
  free: {
    tile: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    dot: "bg-emerald-500",
    label: "Free",
  },
  reserved: {
    tile: "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    dot: "bg-amber-500",
    label: "Reserved",
  },
  occupied: {
    tile: "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-400 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
    dot: "bg-rose-500",
    label: "Occupied",
  },
};

const timeAgo = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso.replace(" ", "T")).getTime()) / 1000));
  if (!Number.isFinite(s)) return "";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
};

// Colour map of all slots with filters, search and hover details
export default function SlotMap({ slots, onReserve }: { slots: Slot[]; onReserve?: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const { prefs } = usePrefs();
  const compact = prefs.compactMap; // Settings -> "Compact slot map"

  const count = (f: Filter) => (f === "all" ? slots.length : slots.filter((s) => s.status === f).length);
  const shown = slots
    .filter((s) => (filter === "all" || s.status === filter) && s.slot_code.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.slot_code.localeCompare(b.slot_code, undefined, { numeric: true })); // P2 before P10

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="font-semibold">Slot map</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">Hover a slot for details · click a free one to reserve</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find slot, e.g. P4"
            className="input w-44 !py-2 pl-9"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["all", "free", "reserved", "occupied"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip relative border !px-2.5 !py-1 ${
              filter === f
                ? "border-transparent text-white"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
            }`}
          >
            {/* the dark marker slides to the chosen filter */}
            {filter === f && <motion.span layoutId="map-filter" className="absolute inset-0 rounded bg-stone-900 dark:bg-brand-600" transition={spring} />}
            {f !== "all" && <span className={`relative size-2 rounded-full ${LOOK[f].dot}`} />}
            <span className="relative">{f === "all" ? "All" : LOOK[f].label}</span>
            <span className="relative opacity-70">{count(f)}</span>
          </button>
        ))}
      </div>

      {slots.length === 0 ? (
        <div className="mt-6 rounded-xl border-2 border-dashed border-stone-200 p-8 text-center text-sm text-stone-500 dark:border-stone-700">
          No slots yet. Upload a parking-lot photo or open <b>Slot Setup</b> to mark the spaces.
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-center text-sm text-stone-500">No slot matches this filter.</p>
      ) : (
        <div className={`mt-4 grid gap-2.5 ${compact ? "grid-cols-5 sm:grid-cols-8 md:grid-cols-10 xl:grid-cols-14" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8"}`}>
          <AnimatePresence initial={false}>
          {shown.map((s) => {
            const look = LOOK[s.status];
            const canBook = s.status === "free" && onReserve;
            return (
              <motion.button
                key={s.id}
                layout // slides to its new place when the list is filtered or sorted
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={spring}
                onClick={canBook ? onReserve : undefined}
                className={`group relative flex flex-col items-center rounded-md border-2 px-2 transition-colors ${compact ? "py-1.5" : "py-3"} hover:shadow-md ${look.tile} ${
                  canBook ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <span className="absolute top-1.5 right-1.5 text-current opacity-70">
                  {s.slot_type === "ev_charging" && <Zap className="size-3.5" />}
                  {s.slot_type === "handicapped" && <Accessibility className="size-3.5" />}
                </span>
                {/* flashes once when the status changes (key = status) */}
                <motion.span
                  key={s.status}
                  className="pointer-events-none absolute inset-0 rounded-[inherit] bg-current"
                  initial={{ opacity: 0.35 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.9 }}
                />
                {!compact && <Car className={`size-5 transition ${s.status === "free" ? "opacity-25" : ""}`} />}
                <span className="mt-1 text-sm font-bold">{s.slot_code}</span>
                {!compact && <span className="text-[10px] font-semibold tracking-wide uppercase opacity-80">{look.label}</span>}

                {/* hover details */}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-44 -translate-x-1/2 rounded-xl bg-stone-900 p-2.5 text-left text-xs text-white shadow-xl group-hover:block dark:bg-stone-700">
                  <span className="block font-bold">Slot {s.slot_code}</span>
                  <span className="block opacity-80">
                    {s.slot_type === "ev_charging" ? "EV charging" : s.slot_type === "handicapped" ? "Accessible" : "Standard"} · $
                    {(s.hourly_rate ?? 2.5).toFixed(2)}/h
                  </span>
                  <span className="block opacity-80">Changed {timeAgo(s.updated_at)}</span>
                  {canBook && <span className="mt-1 block font-semibold text-emerald-300">Click to reserve →</span>}
                </span>
              </motion.button>
            );
          })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
