// ------------------------------------------------------------
// EvChargers.tsx - Feature 4: EV charger turnover panel
// Shows every charger (charging / fully charged / idle and blocking /
// free) and when the next one should be free, so incoming EV drivers
// know how long to wait. Data: GET /api/ev/chargers (ev_charging.py).
// ------------------------------------------------------------
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertOctagon, BatteryCharging, BatteryFull, CalendarCheck, Car, CircleParking, Zap } from "lucide-react";
import { getEvChargers } from "../api";
import type { EvState, EvStatus } from "../types";

export const money = (n: number) => `$${n.toFixed(2)}`;
export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// 90 -> "1 h 30 min"
export function formatMinutes(m: number) {
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  if (!h) return `${rest} min`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

const minutesUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 60000);

// charger list for the booking page and the dashboard, refreshed every 5 seconds
export function useEvChargers(enabled: boolean) {
  const [data, setData] = useState<EvStatus | null>(null);
  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const d = await getEvChargers();
        if (alive) setData(d);
      } catch {
        // backend down: keep the last data
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);
  return data;
}

const LOOK: Record<EvState, { label: string; icon: ReactNode; cls: string }> = {
  free: { label: "Free", icon: <CircleParking className="size-3.5" />, cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  reserved: { label: "Booked", icon: <CalendarCheck className="size-3.5" />, cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  charging: { label: "Charging", icon: <BatteryCharging className="size-3.5" />, cls: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  charged: { label: "Fully charged", icon: <BatteryFull className="size-3.5" />, cls: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  idle: { label: "Idle - blocking", icon: <AlertOctagon className="size-3.5" />, cls: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  occupied: { label: "Occupied", icon: <Car className="size-3.5" />, cls: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300" },
};

// short text for a charger card on the booking page ("free ~14:30")
export function freeHint(data: EvStatus | null, slotId: number) {
  const c = data?.chargers.find((x) => x.slot_id === slotId);
  if (!c) return null;
  if (c.state === "idle") return `overdue ${c.idle_minutes} min`;
  if (c.free_at && c.state !== "free") return `free ~${clock(c.free_at)}`;
  return null;
}

export default function EvChargersPanel({ data, isOperator }: { data: EvStatus; isOperator: boolean }) {
  const { rules } = data;
  const next = data.next_free_at;
  const nextText = !next ? "unknown" : minutesUntil(next) <= 0 ? "now" : `in ${formatMinutes(minutesUntil(next))} (${clock(next)})`;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-5 py-4 dark:border-stone-800">
        <span className="flex size-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
          <Zap className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">EV chargers</h3>
          <p className="text-xs text-stone-500 dark:text-stone-400">When charging ends, drivers have {rules.idle_grace_minutes} minutes to move for the next car</p>
        </div>
        <span className="chip bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">Next free charger: {nextText}</span>
        {data.queue > 0 && (
          <span className="chip bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            {data.queue} in the EV queue
          </span>
        )}
      </div>

      {data.chargers.length === 0 ? (
        <p className="px-5 py-6 text-sm text-stone-500">No EV chargers yet. The operator can mark a space as EV charging on the Slot Setup page.</p>
      ) : (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {data.chargers.map((c) => {
            const look = LOOK[c.state];
            let detail: ReactNode = null;
            if (c.state === "free") detail = <span className="text-emerald-600 dark:text-emerald-400">Free now</span>;
            if (c.state === "occupied") detail = "A car is parked without a booking";
            if (c.state === "reserved" && c.free_at) detail = `Driver on the way · free by ${clock(c.free_at)} at the latest`;
            if (c.state === "charging" && c.ends_at) {
              const total = c.started_at ? new Date(c.ends_at).getTime() - new Date(c.started_at).getTime() : 0;
              const done = c.started_at ? Date.now() - new Date(c.started_at).getTime() : 0;
              const pct = total > 0 ? Math.min(100, Math.max(0, (done / total) * 100)) : 0;
              detail = (
                <div className="flex items-center gap-3">
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span>
                    {formatMinutes(Math.max(0, minutesUntil(c.ends_at)))} left · done {clock(c.ends_at)}
                  </span>
                </div>
              );
            }
            if (c.state === "charged" && c.free_at) detail = `Charging done · must move by ${clock(c.free_at)}`;
            if (c.state === "idle")
              detail = (
                <span className="text-rose-600 dark:text-rose-400">
                  Overdue {formatMinutes(c.idle_minutes)} · idle fee {money(c.idle_fee)} so far
                </span>
              );
            return (
              <li key={c.slot_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
                <span className="w-12 text-lg font-extrabold tracking-tight">{c.slot_code}</span>
                <span className={`chip w-32 justify-center ${look.cls}`}>
                  {look.icon} {look.label}
                </span>
                <div className="min-w-0 flex-1 text-stone-600 dark:text-stone-300">{detail}</div>
                {isOperator && c.license_plate && (
                  <span className="font-mono text-xs text-stone-500" title={c.driver_name}>
                    {c.license_plate}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="border-t border-stone-100 bg-stone-50 px-5 py-2.5 text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-800/40 dark:text-stone-400">
        {money(rules.rate_per_hour)} per hour of charging time · charging starts at check-in · after charging, {rules.idle_grace_minutes} min to move, then{" "}
        {money(rules.idle_fee_per_minute)}/min idle fee (max {money(rules.idle_fee_cap)})
      </p>
    </section>
  );
}
