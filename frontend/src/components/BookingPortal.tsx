// ------------------------------------------------------------
// BookingPortal.tsx - Feature 3: Driver slot reservation page
// Author: Tamanna Akter Mou (ID: 2211951042)
// Talks to backend/reservation_backend.py (/api/reservations/...)
// (UI redesign: boarding-pass ticket, PIN boxes, duration chips -
//  the booking logic below is unchanged)
// ------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import {
  Accessibility,
  BadgeCheck,
  CalendarCheck,
  Car,
  Clock,
  KeyRound,
  Loader2,
  Mail,
  MousePointerClick,
  ParkingSquare,
  Timer,
  User as UserIcon,
  WifiOff,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  cancelReservation,
  checkinReservation,
  createReservation,
  getReservation,
  getSlots,
} from "../api";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "../auth";
import { CheckDraw, popIn, spring } from "../motion";
import { useToast } from "../toast";
import type { ReservationStatus, Slot } from "../types";

// The driver's own booking. Kept in localStorage so the ticket (and its PIN)
// survives a page reload while the reservation is still running.
interface ActiveReservation {
  id: number;
  reservation_code: string;
  slot_code: string;
  driver_name: string;
  license_plate: string;
  total_price: number;
  grace_deadline: string;
  checkin_pin: string;
  status: ReservationStatus;
}

const TICKET_KEY = "smart-parking-ticket";
const GRACE_SECONDS = 15 * 60;

function loadTicket(): ActiveReservation | null {
  try {
    const raw = localStorage.getItem(TICKET_KEY);
    return raw ? (JSON.parse(raw) as ActiveReservation) : null;
  } catch {
    return null;
  }
}

function saveTicket(ticket: ActiveReservation | null) {
  try {
    if (ticket) localStorage.setItem(TICKET_KEY, JSON.stringify(ticket));
    else localStorage.removeItem(TICKET_KEY);
  } catch {
    // storage blocked (private window) - the ticket just won't survive a reload
  }
}

const ENDED_MESSAGE: Partial<Record<ReservationStatus, string>> = {
  expired: "Grace period expired! Your reservation has been auto-released.",
  cancelled: "Your reservation was cancelled.",
  completed: "Your reservation is completed. Thank you!",
};

const FILTERS: { id: string; label: string; icon?: ReactNode }[] = [
  { id: "all", label: "All spaces" },
  { id: "standard", label: "Standard" },
  { id: "ev", label: "EV charging", icon: <Zap className="size-3.5" /> },
  { id: "accessible", label: "Accessible", icon: <Accessibility className="size-3.5" /> },
];

const DURATIONS = [1, 2, 3, 4, 8];

const STATUS_PILL: Record<Slot["status"], string> = {
  free: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  reserved: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  occupied: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function typeInfo(slot: Slot) {
  if (slot.slot_type === "ev_charging") return { label: "EV fast charger", icon: <Zap className="size-4" />, cls: "text-sky-600 bg-sky-50 dark:bg-sky-500/15 dark:text-sky-300" };
  if (slot.slot_type === "handicapped") return { label: "Accessible bay", icon: <Accessibility className="size-4" />, cls: "text-violet-600 bg-violet-50 dark:bg-violet-500/15 dark:text-violet-300" };
  return { label: "Standard bay", icon: <Car className="size-4" />, cls: "text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300" };
}

// 4 separate boxes for the check-in PIN; typing jumps to the next box
function PinBoxes({ value, onChange, onDone }: { value: string; onChange: (v: string) => void; onDone: () => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(4, " ").slice(0, 4).split("");

  const setDigit = (i: number, d: string) => {
    const next = digits.map((c, k) => (k === i ? d || " " : c)).join("").replace(/ +$/, "");
    onChange(next);
    if (d && i < 3) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && digits[i] === " " && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "Enter" && value.length === 4) onDone();
  };

  return (
    <div className="flex gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d.trim()}
          inputMode="numeric"
          maxLength={1}
          aria-label={`PIN digit ${i + 1}`}
          onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, "").slice(-1))}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
            if (pasted) {
              e.preventDefault();
              onChange(pasted);
              refs.current[Math.min(pasted.length, 3)]?.focus();
            }
          }}
          className="size-12 rounded-xl border-2 border-stone-200 bg-white text-center font-mono text-xl font-bold outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-stone-700 dark:bg-stone-800"
        />
      ))}
    </div>
  );
}

// circle that empties as the 15-minute grace period runs out
function CountdownRing({ secondsLeft }: { secondsLeft: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const part = Math.max(0, Math.min(1, secondsLeft / GRACE_SECONDS));
  const urgent = secondsLeft < 180;
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-stone-100 dark:stroke-stone-800" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          stroke={urgent ? "#f43f5e" : "#f59e0b"}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - part)}
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono text-lg font-bold tabular-nums ${urgent ? "text-rose-600" : ""}`}>{`${m}:${s < 10 ? "0" : ""}${s}`}</span>
        <span className="text-[10px] text-stone-500">to arrive</span>
      </div>
    </div>
  );
}

export default function BookingPortal() {
  const { user } = useAuth(); // pre-fills the booking form
  const toast = useToast();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [offline, setOffline] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [driverName, setDriverName] = useState(user?.full_name ?? "");
  const [driverEmail, setDriverEmail] = useState(user?.email ?? "");
  const [licensePlate, setLicensePlate] = useState("");
  const [durationHours, setDurationHours] = useState(1);
  const [activeReservation, setActiveReservation] = useState<ActiveReservation | null>(loadTicket);
  const [now, setNow] = useState(Date.now());
  const [enteredPin, setEnteredPin] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [busy, setBusy] = useState(false);

  // messages now appear as pop-up toasts
  const setNotice = (n: { ok: boolean; text: string } | null) => {
    if (n) toast(n.ok ? "success" : "error", n.text);
  };

  const updateTicket = (ticket: ActiveReservation | null) => {
    setActiveReservation(ticket);
    saveTicket(ticket);
  };

  // Poll live slot status (free / reserved / occupied) from the backend
  useEffect(() => {
    const fetchSlots = async () => {
      try {
        setSlots(await getSlots());
        setOffline(false);
      } catch {
        setOffline(true);
      }
    };
    fetchSlots();
    const interval = setInterval(fetchSlots, 2500);
    return () => clearInterval(interval);
  }, []);

  // Follow our own reservation on the server: the grace-period worker may expire it
  const ticketId = activeReservation?.id;
  useEffect(() => {
    if (ticketId === undefined) return;
    const check = async () => {
      try {
        const res = await getReservation(ticketId);
        const ended = ENDED_MESSAGE[res.status];
        if (ended) {
          updateTicket(null);
          setEnteredPin("");
          setNotice({ ok: res.status === "completed", text: ended });
        } else {
          setActiveReservation((t) => {
            if (!t || t.status === res.status) return t;
            const next = { ...t, status: res.status };
            saveTicket(next);
            return next;
          });
        }
      } catch (e) {
        if ((e as Error).message.includes("not found")) updateTicket(null); // slot was deleted
      }
    };
    check();
    const interval = setInterval(check, 2500);
    return () => clearInterval(interval);
  }, [ticketId]);

  // Grace Period countdown clock (the deadline itself comes from the server)
  useEffect(() => {
    if (!activeReservation || activeReservation.status !== "pending") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeReservation]);

  const handleBook = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !driverName || !licensePlate) return;
    setBusy(true);
    setBookingError("");
    try {
      const ticket = await createReservation({
        slot_id: selectedSlot.id,
        driver_name: driverName,
        driver_email: driverEmail,
        license_plate: licensePlate,
        duration_hours: durationHours,
      });
      updateTicket({
        id: ticket.id,
        reservation_code: ticket.reservation_code,
        slot_code: ticket.slot_code,
        driver_name: driverName,
        license_plate: licensePlate.toUpperCase(),
        total_price: ticket.total_price,
        grace_deadline: ticket.grace_deadline,
        checkin_pin: ticket.checkin_pin,
        status: "pending",
      });
      setNow(Date.now());
      setNotice({ ok: true, text: ticket.message });
      setSelectedSlot(null);
    } catch (err) {
      setBookingError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCheckin = async () => {
    if (!activeReservation) return;
    try {
      const r = await checkinReservation(activeReservation.id, enteredPin);
      updateTicket({ ...activeReservation, status: "active" });
      setNotice({ ok: true, text: r.message });
    } catch (err) {
      setNotice({ ok: false, text: `${(err as Error).message}. Please enter the PIN shown on your booking ticket.` });
    }
  };

  const handleCancel = async () => {
    if (!activeReservation) return;
    if (!confirm("Are you sure you want to cancel this reservation? The slot will be released immediately.")) return;
    try {
      const r = await cancelReservation(activeReservation.id);
      setNotice({ ok: true, text: r.message });
    } catch (err) {
      setNotice({ ok: false, text: (err as Error).message });
    }
    updateTicket(null);
    setEnteredPin("");
  };

  const filteredSlots = slots
    .filter((s) => {
      if (filterType === "standard") return (s.slot_type ?? "standard") === "standard";
      if (filterType === "ev") return s.slot_type === "ev_charging";
      if (filterType === "accessible") return s.slot_type === "handicapped";
      return true;
    })
    // free spaces first, then by name (P2 before P10)
    .sort((a, b) => Number(b.status === "free") - Number(a.status === "free") || a.slot_code.localeCompare(b.slot_code, undefined, { numeric: true }));

  const freeCount = filteredSlots.filter((s) => s.status === "free").length;
  const graceSecondsLeft = activeReservation
    ? Math.max(0, Math.floor((new Date(activeReservation.grace_deadline).getTime() - now) / 1000))
    : 0;
  const rate = selectedSlot?.hourly_rate || 2.5;

  return (
    <div className="space-y-6">
      {offline && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <WifiOff className="size-5" /> Cannot reach the backend at http://localhost:8000 - start it to see and book slots.
        </div>
      )}

      {/* ---------- ticket (when you have a booking) or how-it-works ---------- */}
      {activeReservation ? (
        <motion.div
          key={activeReservation.id}
          initial={{ clipPath: "inset(0 0 100% 0)", y: -16 }}
          animate={{ clipPath: "inset(0 0 0% 0)", y: 0 }}
          transition={{ duration: 0.9, ease: [0.25, 1, 0.5, 1] }}
          className="overflow-hidden rounded-xl md:flex"
        >
          {/* left: coloured stub */}
          <div className="relative flex flex-col justify-between bg-brand-600 p-6 text-white md:w-64">
            <div>
              <p className="text-xs font-semibold tracking-widest text-brand-100 uppercase">Parking ticket</p>
              <p className="mt-1 font-mono text-sm text-brand-100">{activeReservation.reservation_code}</p>
            </div>
            <div className="my-6">
              <p className="text-xs text-brand-100">Your space</p>
              <p className="text-6xl leading-none font-black tracking-tight">{activeReservation.slot_code}</p>
            </div>
            <span className={`chip w-fit ${activeReservation.status === "pending" ? "bg-amber-400 text-amber-950" : "bg-emerald-400 text-emerald-950"}`}>
              {activeReservation.status === "pending" ? <Timer className="size-3.5" /> : <BadgeCheck className="size-3.5" />}
              {activeReservation.status === "pending" ? "Waiting for you" : "Checked in & parked"}
            </span>
            {/* perforation notches */}
            <span className="absolute -top-3 -right-3 hidden size-6 rounded-full bg-stone-100 md:block dark:bg-stone-950" />
            <span className="absolute -right-3 -bottom-3 hidden size-6 rounded-full bg-stone-100 md:block dark:bg-stone-950" />
          </div>

          {/* right: details + actions */}
          <div className="flex-1 border-dashed border-stone-200 bg-white p-6 md:border-l-2 dark:border-stone-700 dark:bg-stone-900">
            <div className="flex flex-wrap items-start gap-6">
              <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-stone-500">Driver</dt>
                  <dd className="font-semibold">{activeReservation.driver_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">License plate</dt>
                  <dd className="font-mono font-semibold">{activeReservation.license_plate}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Total</dt>
                  <dd className="font-semibold text-emerald-600 dark:text-emerald-400">${activeReservation.total_price.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Check-in PIN</dt>
                  <dd className="font-mono text-lg font-bold tracking-[0.3em] text-brand-600 dark:text-brand-400">{activeReservation.checkin_pin}</dd>
                </div>
              </dl>
              {activeReservation.status === "pending" ? (
                <CountdownRing secondsLeft={graceSecondsLeft} />
              ) : (
                <div className="flex size-24 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <CheckDraw size={56} />
                </div>
              )}
            </div>

            {activeReservation.status === "pending" && (
              <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-stone-100 pt-5 dark:border-stone-800">
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                    <KeyRound className="size-4 text-stone-400" /> Arrived? Enter your PIN
                  </p>
                  <PinBoxes value={enteredPin} onChange={setEnteredPin} onDone={handleCheckin} />
                </div>
                <button onClick={handleCheckin} disabled={enteredPin.length !== 4} className="btn-primary !py-3">
                  <BadgeCheck className="size-4" /> Check in
                </button>
                <button onClick={handleCancel} className="btn-danger ml-auto !py-3">
                  <XCircle className="size-4" /> Cancel booking
                </button>
              </div>
            )}
          </div>
        </motion.div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <MousePointerClick className="size-5" />, title: "Choose a space", text: "Pick any green space below" },
            { icon: <CalendarCheck className="size-5" />, title: "Book it", text: "Enter your plate and how long you stay" },
            { icon: <Clock className="size-5" />, title: "Arrive in 15 min", text: "We hold the space for you meanwhile" },
            { icon: <KeyRound className="size-5" />, title: "Check in with PIN", text: "Type the 4-digit PIN from your ticket" },
          ].map((s, i) => (
            <div key={s.title} className="card flex items-start gap-3 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">{s.icon}</span>
              <div>
                <p className="text-xs font-semibold text-brand-600 dark:text-brand-400">Step {i + 1}</p>
                <p className="font-semibold">{s.title}</p>
                <p className="text-xs text-stone-500 dark:text-stone-400">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- filters ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`chip border !px-3.5 !py-1.5 text-sm ${
                filterType === f.id
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
              }`}
            >
              {f.icon} {f.label}
            </button>
          ))}
        </div>
        <span className="chip ml-auto bg-emerald-50 !py-1.5 text-sm text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <span className="size-2 animate-pulse rounded-full bg-emerald-500" /> {freeCount} available now
        </span>
      </div>

      {/* ---------- slot cards ---------- */}
      {filteredSlots.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-12 text-center text-stone-500">
          <ParkingSquare className="size-10 opacity-40" />
          No spaces of this type. Try another filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence initial={false}>
          {filteredSlots.map((slot, i) => {
            const isFree = slot.status === "free";
            const t = typeInfo(slot);
            return (
              <motion.div
                key={slot.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: isFree ? 1 : 0.6, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ ...spring, delay: Math.min(i, 10) * 0.03 }}
                whileHover={isFree ? { y: -3 } : undefined}
                className={`card group relative overflow-hidden p-4 transition-colors ${isFree ? "hover:border-brand-300 hover:shadow-md dark:hover:border-brand-500/50" : ""}`}
              >
                <span className={`absolute inset-x-0 top-0 h-1 ${isFree ? "bg-emerald-500" : slot.status === "reserved" ? "bg-amber-500" : "bg-rose-500"}`} />
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-2xl font-extrabold tracking-tight">{slot.slot_code}</p>
                    <span className={`chip mt-1 !px-2 ${t.cls}`}>
                      {t.icon} {t.label}
                    </span>
                  </div>
                  <span className={`chip uppercase ${STATUS_PILL[slot.status]}`}>{slot.status}</span>
                </div>
                <div className="mt-4 flex items-end justify-between border-t border-stone-100 pt-3 dark:border-stone-800">
                  <p>
                    <span className="text-xl font-bold">${(slot.hourly_rate || 2.5).toFixed(2)}</span>
                    <span className="text-xs text-stone-500"> / hour</span>
                  </p>
                  {isFree ? (
                    <button
                      onClick={() => {
                        setBookingError("");
                        setSelectedSlot(slot);
                      }}
                      disabled={!!activeReservation}
                      title={activeReservation ? "You already have an active reservation" : undefined}
                      className="btn-primary !px-3 !py-1.5 text-xs"
                    >
                      Reserve
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-stone-400">Unavailable</span>
                  )}
                </div>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      )}

      {/* ---------- booking dialog ---------- */}
      <AnimatePresence>
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            onClick={() => setSelectedSlot(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div variants={popIn} initial="hidden" animate="show" exit="exit" className="card relative max-h-[92vh] w-full max-w-md overflow-y-auto shadow-xl">
            <div className="flex items-center gap-4 bg-brand-600 p-5 text-white">
              <span className="flex size-14 items-center justify-center rounded-lg bg-white/20 text-2xl font-black">{selectedSlot.slot_code}</span>
              <div>
                <p className="text-lg font-bold">Book space {selectedSlot.slot_code}</p>
                <p className="text-sm text-brand-100">
                  {typeInfo(selectedSlot).label} · ${rate.toFixed(2)}/hour
                </p>
              </div>
              <button onClick={() => setSelectedSlot(null)} className="ml-auto rounded-lg p-1.5 hover:bg-white/20" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleBook} className="space-y-4 p-5">
              {[
                { label: "Driver full name", icon: <UserIcon className="size-4" />, value: driverName, set: setDriverName, type: "text", ph: "e.g. Tamanna Akter", extra: "" },
                { label: "Email address", icon: <Mail className="size-4" />, value: driverEmail, set: setDriverEmail, type: "email", ph: "name@example.com", extra: "" },
                { label: "Vehicle license plate", icon: <Car className="size-4" />, value: licensePlate, set: setLicensePlate, type: "text", ph: "e.g. DHA-12-3456", extra: "font-mono uppercase" },
              ].map((f) => (
                <label key={f.label} className="block text-sm font-medium">
                  {f.label}
                  <span className="relative mt-1.5 block">
                    <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-400">{f.icon}</span>
                    <input type={f.type} required placeholder={f.ph} value={f.value} onChange={(e) => f.set(e.target.value)} className={`input pl-10 ${f.extra}`} />
                  </span>
                </label>
              ))}

              <div>
                <p className="mb-1.5 text-sm font-medium">How long will you stay?</p>
                <div className="grid grid-cols-5 gap-2">
                  {DURATIONS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setDurationHours(h)}
                      className={`rounded-xl border-2 py-2 text-sm font-semibold transition ${
                        durationHours === h
                          ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                          : "border-stone-200 hover:border-stone-300 dark:border-stone-700"
                      }`}
                    >
                      {h === 8 ? "Day" : `${h}h`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 rounded-xl bg-stone-50 p-4 text-sm dark:bg-stone-800/60">
                <div className="flex justify-between text-stone-600 dark:text-stone-300">
                  <span>
                    ${rate.toFixed(2)} × {durationHours} hour{durationHours > 1 ? "s" : ""}
                  </span>
                  <span>${(rate * durationHours).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-stone-600 dark:text-stone-300">
                  <span>Arrival window</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">15 minutes</span>
                </div>
                <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-bold dark:border-stone-700">
                  <span>Total</span>
                  <span className="text-emerald-600 dark:text-emerald-400">${(rate * durationHours).toFixed(2)}</span>
                </div>
              </div>

              {bookingError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{bookingError}</p>}

              <div className="flex gap-2">
                <button type="button" onClick={() => setSelectedSlot(null)} className="btn-ghost flex-1 !py-2.5">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="btn-primary flex-1 !py-2.5">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarCheck className="size-4" />}
                  {busy ? "Booking..." : "Confirm & book"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
}
