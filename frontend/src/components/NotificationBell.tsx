// Bell in the top bar: a live feed of slot changes ("P4 is now free")
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Bell, BellOff, CalendarCheck, Car, CheckCheck, CircleParking } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { getSlots } from "../api";
import { popIn } from "../motion";
import { usePrefs } from "../prefs";
import type { Slot } from "../types";

interface SlotEvent {
  id: number;
  code: string;
  status: Slot["status"];
  at: number; // time in ms
}

const LOOK: Record<Slot["status"], { icon: ReactNode; text: string; cls: string }> = {
  free: { icon: <CircleParking className="size-4" />, text: "is now free", cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" },
  reserved: { icon: <CalendarCheck className="size-4" />, text: "was reserved", cls: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
  occupied: { icon: <Car className="size-4" />, text: "is now occupied", cls: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" },
};

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
};

let nextId = 1;

export default function NotificationBell() {
  const { prefs } = usePrefs();
  const [events, setEvents] = useState<SlotEvent[]>([]);
  const [seen, setSeen] = useState(0); // id of the newest event already looked at
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0); // re-render so "2 min ago" stays right
  const last = useRef<Map<number, Slot["status"]> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const notifyRef = useRef(prefs.notifyFree);
  notifyRef.current = prefs.notifyFree;

  // compare the slots every 3 seconds with the previous check
  useEffect(() => {
    const check = async () => {
      let slots: Slot[];
      try {
        slots = await getSlots();
      } catch {
        return;
      }
      const before = last.current;
      last.current = new Map(slots.map((s) => [s.id, s.status]));
      if (!before) return; // first check only remembers the current state
      const changed = slots.filter((s) => before.has(s.id) && before.get(s.id) !== s.status);
      if (!changed.length) return;
      const now = Date.now();
      setEvents((list) => [...changed.map((s) => ({ id: nextId++, code: s.slot_code, status: s.status, at: now })).reverse(), ...list].slice(0, 30));

      const freed = changed.filter((s) => s.status === "free");
      if (freed.length && notifyRef.current && "Notification" in window && Notification.permission === "granted") {
        new Notification("A parking space is free", {
          body: `${freed.map((s) => s.slot_code).join(", ")} ${freed.length > 1 ? "are" : "is"} free right now.`,
        });
      }
    };
    check();
    const t = setInterval(check, 3000);
    const clock = setInterval(() => tick((n) => n + 1), 30000);
    return () => {
      clearInterval(t);
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const unread = events.filter((e) => e.id > seen).length;
  const openMenu = () => {
    setOpen((o) => !o);
    if (events.length) setSeen(events[0].id);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={openMenu} className="btn-ghost relative !p-2.5" aria-label="Notifications" title="Slot changes">
        <Bell className={`size-4 ${unread ? "animate-wiggle" : ""}`} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-stone-900">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
      {open && (
        <motion.div
          variants={popIn}
          initial="hidden"
          animate="show"
          exit="exit"
          style={{ transformOrigin: "top right" }}
          className="card absolute right-0 z-50 mt-2 w-80 overflow-hidden shadow-xl max-sm:fixed max-sm:inset-x-3 max-sm:w-auto"
        >
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 dark:border-stone-800">
            <p className="font-semibold">Slot changes</p>
            {events.length > 0 && (
              <button onClick={() => setEvents([])} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                <CheckCheck className="size-3.5" /> Clear
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {events.map((e, i) => (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.03 }}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/50"
              >
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${LOOK[e.status].cls}`}>{LOOK[e.status].icon}</span>
                <p className="flex-1 text-sm">
                  Slot <b>{e.code}</b> {LOOK[e.status].text}
                </p>
                <span className="text-xs whitespace-nowrap text-stone-400">{ago(e.at)}</span>
              </motion.li>
            ))}
            {events.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-stone-500">
                <BellOff className="size-8 opacity-40" />
                No changes yet. When a space becomes free, reserved or occupied it shows up here.
              </li>
            )}
          </ul>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
