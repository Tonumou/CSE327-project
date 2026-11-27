// ------------------------------------------------------------
// BookingPortal.tsx - Feature 3: Driver slot reservation page
// Author: Tamanna Akter Mou (ID: 2211951042)
// Talks to backend/reservation_backend.py (/api/reservations/...),
// waitlist.py (/api/waitlist) and penalties.py (/api/penalties).
// The driver's booking is read from the server (/api/reservations/mine),
// so a space the waitlist books for them appears here by itself.
// ------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import {
  Accessibility,
  AlertTriangle,
  BadgeCheck,
  Ban,
  CalendarCheck,
  Car,
  Clock,
  Hourglass,
  KeyRound,
  ListOrdered,
  Loader2,
  LogOut,
  Mail,
  MousePointerClick,
  ParkingSquare,
  Receipt,
  Timer,
  User as UserIcon,
  Users,
  WifiOff,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  cancelReservation,
  checkinReservation,
  checkoutReservation,
  createReservation,
  getMyPenalties,
  getMyReservations,
  getMyWaitlist,
  getSlots,
  joinWaitlist,
  leaveWaitlist,
} from "../api";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "../auth";
import { CheckDraw, popIn, spring } from "../motion";
import { useToast } from "../toast";
import type { PenaltyStatus, Reservation, ReservationStatus, Slot, SlotType, WaitlistStatus } from "../types";
import EvChargersPanel, { formatMinutes, freeHint, useEvChargers } from "./EvChargers";

const GRACE_SECONDS = 15 * 60;

const isOpen = (r: Reservation) => r.status === "pending" || r.status === "active";

const ENDED_MESSAGE: Partial<Record<ReservationStatus, string>> = {
  expired: "Grace period expired! Your reservation has been auto-released.",
  cancelled: "Your reservation was cancelled.",
  completed: "Your parking session has ended. Thank you!",
};

const FILTERS: { id: string; label: string; icon?: ReactNode }[] = [
  { id: "all", label: "All spaces" },
  { id: "standard", label: "Standard" },
  { id: "ev", label: "EV charging", icon: <Zap className="size-3.5" /> },
  { id: "accessible", label: "Accessible", icon: <Accessibility className="size-3.5" /> },
];

// which waitlist queue a filter means ("All spaces" -> the standard queue)
const FILTER_TYPE: Record<string, SlotType> = { all: "standard", standard: "standard", ev: "ev_charging", accessible: "handicapped" };
const TYPE_LABEL: Record<SlotType, string> = { standard: "standard", ev_charging: "EV charging", handicapped: "accessible" };
const withArticle = (word: string) => (/^[aeiouAEIOU]/.test(word) || word.startsWith("EV") ? "an " : "a ") + word;

const DURATIONS = [1, 2, 3, 4, 8];
const WAIT_OPTIONS = [30, 60, 120];
const CHARGE_OPTIONS = [30, 60, 90, 120, 180, 240]; // minutes (the backend sends the real list)
const chargeLabel = (m: number) => (m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}½h` : `${m / 60}h`);

const STATUS_PILL: Record<Slot["status"], string> = {
  free: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  reserved: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  occupied: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

const BOOKING_PILL: Record<ReservationStatus, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  completed: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
  cancelled: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  expired: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

const money = (n: number) => `$${n.toFixed(2)}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dayClock = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function typeInfo(slot: Slot) {
  if (slot.slot_type === "ev_charging") return { label: "EV charger", icon: <Zap className="size-4" />, cls: "text-sky-600 bg-sky-50 dark:bg-sky-500/15 dark:text-sky-300" };
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

// Feature 4: ring that fills while an EV charges (blue), then turns violet
// when it is full and red when the idle fee is running
function ChargeRing({ percent, tone }: { percent: number; tone: "charging" | "charged" | "idle" }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = tone === "charging" ? "#0ea5e9" : tone === "charged" ? "#8b5cf6" : "#f43f5e";
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
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ color }}>
        <Zap className={`size-5 ${tone === "charging" ? "animate-pulse" : ""}`} />
        <span className="font-mono text-sm font-bold tabular-nums">{Math.round(percent)}%</span>
      </div>
    </div>
  );
}

// pop-up window used by the booking and the waitlist forms
function Dialog({ onClose, header, children }: { onClose: () => void; header: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div variants={popIn} initial="hidden" animate="show" exit="exit" className="card relative max-h-[92vh] w-full max-w-md overflow-y-auto shadow-xl">
        <div className="flex items-center gap-4 bg-brand-600 p-5 text-white">
          {header}
          <button type="button" onClick={onClose} className="ml-auto rounded-lg p-1.5 hover:bg-white/20" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

// row of option buttons (duration, waiting time, space type)
function Choice<T extends string | number>({ options, value, onChange, label }: { options: T[]; value: T; onChange: (v: T) => void; label: (v: T) => ReactNode }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-xl border-2 px-1 py-2 text-sm font-semibold transition ${
            value === o
              ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
              : "border-stone-200 hover:border-stone-300 dark:border-stone-700"
          }`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

const durationLabel = (h: number) => (h === 8 ? "Day" : `${h}h`);

export default function BookingPortal() {
  const { user } = useAuth(); // pre-fills the booking form
  const toast = useToast();
  const [slots, setSlots] = useState<Slot[] | null>(null); // null = first load not back yet
  const [offline, setOffline] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [waitType, setWaitType] = useState<SlotType | null>(null); // waitlist form open for this type
  const [driverName, setDriverName] = useState(user?.full_name ?? "");
  const [driverEmail, setDriverEmail] = useState(user?.email ?? "");
  const [licensePlate, setLicensePlate] = useState("");
  const [durationHours, setDurationHours] = useState(1);
  const [chargeMinutes, setChargeMinutes] = useState(60); // EV chargers: charging time
  const [waitMinutes, setWaitMinutes] = useState(60);
  const [mine, setMine] = useState<Reservation[] | null>(null); // my bookings, newest first
  const [penalty, setPenalty] = useState<PenaltyStatus | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  const [enteredPin, setEnteredPin] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  // messages appear as pop-up toasts
  const notice = (ok: boolean, text: string) => toast(ok ? "success" : "error", text);

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

  // My bookings, my place on the waitlist and my no-show record
  const refreshMine = useCallback(async () => {
    try {
      const [m, p, w] = await Promise.all([getMyReservations(), getMyPenalties(), getMyWaitlist()]);
      setMine(m);
      setPenalty(p);
      setWaitlist(w);
    } catch {
      // backend down: the slot poll above shows the offline banner
    }
  }, []);

  useEffect(() => {
    refreshMine();
    const interval = setInterval(refreshMine, 3000);
    return () => clearInterval(interval);
  }, [refreshMine]);

  const activeReservation = mine?.find(isOpen) ?? null;

  // Tell the driver when their booking changes on the server by itself: the
  // grace worker expired it, the camera saw the car leave, or the waitlist
  // booked a space for them. Changes made with the buttons below already
  // show their own message, so their ids are remembered in ownActions.
  const lastOpenId = useRef<number | null | undefined>(undefined); // undefined = not loaded yet
  const ownActions = useRef(new Set<number>());
  useEffect(() => {
    if (!mine) return;
    const openId = activeReservation?.id ?? null;
    const before = lastOpenId.current;
    lastOpenId.current = openId;
    if (before === undefined || before === openId) return;
    if (before !== null && !ownActions.current.has(before)) {
      const ended = mine.find((r) => r.id === before);
      const text = ended && ENDED_MESSAGE[ended.status];
      if (ended && text) notice(ended.status === "completed", text);
    }
    if (activeReservation && !ownActions.current.has(activeReservation.id)) {
      notice(true, `Space ${activeReservation.slot_code} is booked for you. Arrive within 15 minutes and check in with your PIN.`);
    }
    setEnteredPin("");
  }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Feature 4: charger states, rules and "free ~14:30" hints (only if the lot has chargers)
  const hasChargers = (slots ?? []).some((s) => s.slot_type === "ev_charging");
  const ev = useEvChargers(hasChargers);
  const evRules = ev?.rules;
  const chargeOptions = evRules?.charge_options ?? CHARGE_OPTIONS;

  // Clock for the grace-period countdown and the EV charging progress
  // (the deadlines themselves come from the server)
  const pending = activeReservation?.status === "pending";
  const evSession = activeReservation?.status === "active" && activeReservation.slot_type === "ev_charging";
  useEffect(() => {
    if (!pending && !evSession) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending, evSession]);

  const handleBook = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !driverName || !licensePlate) return;
    setBusy(true);
    setFormError("");
    const isEv = selectedSlot.slot_type === "ev_charging";
    try {
      const ticket = await createReservation({
        slot_id: selectedSlot.id,
        driver_name: driverName,
        driver_email: driverEmail,
        license_plate: licensePlate,
        duration_hours: isEv ? Math.ceil(chargeMinutes / 60) : durationHours,
        ...(isEv ? { charging_minutes: chargeMinutes } : {}),
      });
      ownActions.current.add(ticket.id);
      notice(true, ticket.message);
      setSelectedSlot(null);
      await refreshMine();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCheckin = async () => {
    if (!activeReservation) return;
    try {
      const r = await checkinReservation(activeReservation.id, enteredPin);
      notice(true, r.message);
      await refreshMine();
    } catch (err) {
      notice(false, `${(err as Error).message}. Please enter the PIN shown on your booking ticket.`);
    }
  };

  const handleCancel = async () => {
    if (!activeReservation) return;
    if (!confirm("Are you sure you want to cancel this reservation? The slot will be released immediately.")) return;
    ownActions.current.add(activeReservation.id);
    try {
      notice(true, (await cancelReservation(activeReservation.id)).message);
    } catch (err) {
      notice(false, (err as Error).message);
    }
    setEnteredPin("");
    await refreshMine();
  };

  const handleCheckout = async () => {
    if (!activeReservation) return;
    if (!confirm(`Leave space ${activeReservation.slot_code} and end your parking session?`)) return;
    ownActions.current.add(activeReservation.id);
    try {
      const r = await checkoutReservation(activeReservation.id);
      notice(true, `${r.message} Total ${money(r.total_price)}.`);
    } catch (err) {
      notice(false, (err as Error).message);
    }
    await refreshMine();
  };

  const handleJoinWaitlist = async (e: FormEvent) => {
    e.preventDefault();
    if (!waitType || !driverName || !licensePlate) return;
    setBusy(true);
    setFormError("");
    const isEv = waitType === "ev_charging";
    try {
      const r = await joinWaitlist({
        slot_type: waitType,
        driver_name: driverName,
        driver_email: driverEmail,
        license_plate: licensePlate,
        duration_hours: isEv ? Math.ceil(chargeMinutes / 60) : durationHours,
        ...(isEv ? { charging_minutes: chargeMinutes } : {}),
        wait_minutes: waitMinutes,
      });
      // when a space was free it is booked at once and the ticket appears by itself
      if (r.entry) notice(true, r.message);
      setWaitType(null);
      await refreshMine();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveWaitlist = async () => {
    try {
      notice(true, (await leaveWaitlist()).message);
    } catch (err) {
      notice(false, (err as Error).message);
    }
    await refreshMine();
  };

  const filteredSlots = (slots ?? [])
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
  const selectedIsEv = selectedSlot?.slot_type === "ev_charging";
  // EV chargers: paid per minute of charging time; other spaces per hour
  const bookingCost = selectedIsEv ? (rate * chargeMinutes) / 60 : rate * durationHours;
  const unpaidFees = penalty?.unpaid_fees ?? 0;

  // Feature 4: where my EV session is (charging -> fully charged -> idle fee running)
  let charge: { percent: number; tone: "charging" | "charged" | "idle"; text: ReactNode } | null = null;
  if (evSession && activeReservation) {
    const end = new Date(activeReservation.end_time).getTime();
    const start = activeReservation.checked_in_at ? new Date(activeReservation.checked_in_at).getTime() : end;
    const grace = (evRules?.idle_grace_minutes ?? 10) * 60000;
    if (now < end) {
      charge = {
        percent: end > start ? Math.min(100, ((now - start) / (end - start)) * 100) : 0,
        tone: "charging",
        text: (
          <>
            <b>Charging</b> · {formatMinutes(Math.ceil((end - now) / 60000))} left · done at {clock(activeReservation.end_time)}. Please move your
            car then, so the next EV driver can charge.
          </>
        ),
      };
    } else if (now < end + grace) {
      const left = Math.ceil((end + grace - now) / 1000);
      charge = {
        percent: 100,
        tone: "charged",
        text: (
          <>
            <b>Fully charged!</b> Please move your car within{" "}
            <b className="font-mono">
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </b>{" "}
            to avoid the idle fee of {money(evRules?.idle_fee_per_minute ?? 0.5)}/min.
          </>
        ),
      };
    } else {
      const idleMin = Math.ceil((now - end - grace) / 60000);
      const fee = Math.min(evRules?.idle_fee_cap ?? 30, idleMin * (evRules?.idle_fee_per_minute ?? 0.5));
      charge = {
        percent: 100,
        tone: "idle",
        text: (
          <>
            <b>Idle fee running: {money(fee)}</b> ({formatMinutes(idleMin)} after charging). Your car is blocking the charger, please check out as
            soon as you leave.
          </>
        ),
      };
    }
  }
  const blockedUntil = penalty?.blocked_until ?? null;
  const rules = penalty?.rules;
  const waiting = waitlist?.entry ?? null;
  const lotTypes = (["standard", "ev_charging", "handicapped"] as SlotType[]).filter((t) => (slots ?? []).some((s) => (s.slot_type ?? "standard") === t));
  const offerWaitlist =
    !activeReservation && !waiting && !blockedUntil && !offline && filteredSlots.length > 0 && freeCount === 0;
  const pastBookings = (mine ?? []).filter((r) => !isOpen(r));

  const openWaitlistForm = (type: SlotType) => {
    setFormError("");
    setWaitType(type);
  };

  const driverFields = (
    <>
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
    </>
  );

  const errorBox = formError && (
    <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{formError}</p>
  );

  return (
    <div className="space-y-6">
      {offline && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <WifiOff className="size-5" /> Cannot reach the backend at http://localhost:8000 - start it to see and book slots.
        </div>
      )}

      {/* ---------- no-show record (penalties.py) ---------- */}
      {blockedUntil && rules ? (
        <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <Ban className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Booking is paused until {dayClock(blockedUntil)}</p>
            <p>
              You missed {plural(penalty!.no_shows, "booking")} in the last {rules.window_days} days. After {rules.limit} no-shows, booking and
              the waitlist are paused for {rules.block_hours} hours.
            </p>
          </div>
        </div>
      ) : penalty && rules && (penalty.no_shows > 0 || unpaidFees > 0) ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            {penalty.no_shows > 0 && <>{plural(penalty.no_shows, "no-show")} in the last {rules.window_days} days. </>}
            {unpaidFees > 0 && <b>{money(unpaidFees)} in no-show fees will be added to your next booking. </b>}
            {rules.limit} no-shows in {rules.window_days} days pause booking for {rules.block_hours} hours.
          </p>
        </div>
      ) : null}

      {/* ---------- ticket (when you have a booking), waitlist place, or how-it-works ---------- */}
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
            <span className={`chip w-fit ${pending ? "bg-amber-400 text-amber-950" : "bg-emerald-400 text-emerald-950"}`}>
              {pending ? <Timer className="size-3.5" /> : <BadgeCheck className="size-3.5" />}
              {pending ? "Waiting for you" : "Checked in & parked"}
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
                  <dd className="font-semibold text-emerald-600 dark:text-emerald-400">{money(activeReservation.total_price)}</dd>
                  {activeReservation.fees_included > 0 && (
                    <dd className="text-xs text-stone-500">incl. {money(activeReservation.fees_included)} no-show fee</dd>
                  )}
                </div>
                {activeReservation.checkin_pin && (
                  <div>
                    <dt className="text-xs text-stone-500">Check-in PIN</dt>
                    <dd className="font-mono text-lg font-bold tracking-[0.3em] text-brand-600 dark:text-brand-400">{activeReservation.checkin_pin}</dd>
                  </div>
                )}
                {activeReservation.charging_minutes ? (
                  <div>
                    <dt className="text-xs text-stone-500">Charging time</dt>
                    <dd className="font-semibold">{formatMinutes(activeReservation.charging_minutes)}</dd>
                  </div>
                ) : (
                  !pending && (
                    <div>
                      <dt className="text-xs text-stone-500">Booked until</dt>
                      <dd className="font-semibold">{clock(activeReservation.end_time)}</dd>
                    </div>
                  )
                )}
              </dl>
              {pending ? (
                <CountdownRing secondsLeft={graceSecondsLeft} />
              ) : charge ? (
                <ChargeRing percent={charge.percent} tone={charge.tone} />
              ) : (
                <div className="flex size-24 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <CheckDraw size={56} />
                </div>
              )}
            </div>

            {pending ? (
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
            ) : (
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-5 dark:border-stone-800">
                {charge && (
                  <p
                    className={`w-full rounded-lg px-3.5 py-2.5 text-sm ${
                      charge.tone === "charging"
                        ? "bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300"
                        : charge.tone === "charged"
                          ? "bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                    }`}
                  >
                    {charge.text}
                  </p>
                )}
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  {charge
                    ? "Leaving? Check out to free the charger for the next EV driver."
                    : "Leaving? Check out to free the space for the next driver. When your time is over and the camera sees the space empty, we check you out automatically."}
                </p>
                <button onClick={handleCheckout} className="btn-ghost ml-auto !py-3">
                  <LogOut className="size-4" /> Leave & check out
                </button>
              </div>
            )}
          </div>
        </motion.div>
      ) : waiting ? (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-wrap items-center gap-5 p-6">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <Hourglass className="size-7 animate-pulse" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-widest text-amber-600 uppercase dark:text-amber-400">On the waitlist</p>
            <p className="text-xl font-bold">
              You are number {waitlist?.position} for {withArticle(TYPE_LABEL[waiting.slot_type])} space
            </p>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              When one becomes free we book it for you automatically and send you the PIN under the bell. You then have 15 minutes to arrive. You leave
              the queue at {clock(waiting.expires_at)}.
            </p>
          </div>
          <button onClick={handleLeaveWaitlist} className="btn-danger">
            <XCircle className="size-4" /> Leave waitlist
          </button>
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

      {/* ---------- full? offer the waitlist (waitlist.py) ---------- */}
      <AnimatePresence>
        {offerWaitlist && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card flex flex-wrap items-center gap-4 border-amber-200 bg-amber-50/60 p-5 dark:border-amber-500/30 dark:bg-amber-500/5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                <Users className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">No free {TYPE_LABEL[FILTER_TYPE[filterType]]} space right now</p>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  Join the waitlist and we book the next one for you automatically.{" "}
                  {waitlist && waitlist.queue[FILTER_TYPE[filterType]] > 0
                    ? `${plural(waitlist.queue[FILTER_TYPE[filterType]], "driver")} waiting.`
                    : "Nobody is waiting yet."}
                </p>
              </div>
              <button onClick={() => openWaitlistForm(FILTER_TYPE[filterType])} className="btn-primary">
                <ListOrdered className="size-4" /> Join the waitlist
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- Feature 4: EV charger turnover ---------- */}
      {filterType === "ev" && ev && <EvChargersPanel data={ev} isOperator={user?.role === "operator"} />}

      {/* ---------- slot cards ---------- */}
      {slots === null && !offline ? (
        // first load: grey placeholders instead of "no spaces"
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card space-y-3 p-4">
              <div className="skeleton h-7 w-14" />
              <div className="skeleton h-5 w-28" />
              <div className="skeleton mt-6 h-7 w-24" />
            </div>
          ))}
        </div>
      ) : filteredSlots.length === 0 ? (
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
                    <span className={`chip mt-1 !px-2 whitespace-nowrap ${t.cls}`}>
                      {t.icon} {t.label}
                    </span>
                  </div>
                  <span className={`chip uppercase ${STATUS_PILL[slot.status]}`}>{slot.status}</span>
                </div>
                <div className="mt-4 flex items-end justify-between border-t border-stone-100 pt-3 dark:border-stone-800">
                  <p className="whitespace-nowrap">
                    <span className="text-xl font-bold">{money(slot.hourly_rate || 2.5)}</span>
                    <span className="text-xs text-stone-500">
                      {slot.slot_type !== "ev_charging" ? " / hour" : isFree ? " / h charging" : " / h"}
                    </span>
                  </p>
                  {isFree ? (
                    <button
                      onClick={() => {
                        setFormError("");
                        setSelectedSlot(slot);
                      }}
                      disabled={!!activeReservation || !!blockedUntil}
                      title={activeReservation ? "You already have an active reservation" : blockedUntil ? "Booking is paused" : undefined}
                      className="btn-primary !px-3 !py-1.5 text-xs"
                    >
                      Reserve
                    </button>
                  ) : (
                    <span className="text-xs font-medium whitespace-nowrap text-stone-400">
                      {(slot.slot_type === "ev_charging" && freeHint(ev, slot.id)) || "Unavailable"}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      )}

      {/* ---------- my booking history ---------- */}
      {pastBookings.length > 0 && (
        <section className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-4 dark:border-stone-800">
            <Receipt className="size-4 text-stone-400" />
            <h3 className="font-semibold">Your recent bookings</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs text-stone-500 dark:bg-stone-800/50 dark:text-stone-400">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Booking</th>
                  <th className="px-3 py-2.5 font-semibold">Space</th>
                  <th className="px-3 py-2.5 font-semibold">Booked</th>
                  <th className="px-3 py-2.5 font-semibold">Result</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Charged</th>
                </tr>
              </thead>
              <tbody>
                {pastBookings.map((r) => (
                  <tr key={r.id} className="border-t border-stone-100 dark:border-stone-800">
                    <td className="px-5 py-3 font-mono text-xs">{r.reservation_code}</td>
                    <td className="px-3 py-3 font-semibold">{r.slot_code}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-stone-500">{dayClock(r.start_time)}</td>
                    <td className="px-3 py-3">
                      <span className={`chip ${BOOKING_PILL[r.status]}`}>{r.status === "expired" ? "no-show" : r.status}</span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {r.status === "completed" && money(r.total_price)}
                      {r.status === "completed" && r.idle_fee > 0 && (
                        <span className="block text-xs text-rose-600 dark:text-rose-400">incl. {money(r.idle_fee)} idle fee</span>
                      )}
                      {r.status === "cancelled" && <span className="text-stone-400">free</span>}
                      {r.status === "expired" && (
                        <span className="text-rose-600 dark:text-rose-400">
                          {money(r.penalty_fee)} fee <span className="text-xs text-stone-400">{r.penalty_paid_by ? "(on a later ticket)" : "(unpaid)"}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------- booking dialog ---------- */}
      <AnimatePresence>
        {selectedSlot && (
          <Dialog
            key="book"
            onClose={() => setSelectedSlot(null)}
            header={
              <>
                <span className="flex size-14 items-center justify-center rounded-lg bg-white/20 text-2xl font-black">{selectedSlot.slot_code}</span>
                <div>
                  <p className="text-lg font-bold">Book space {selectedSlot.slot_code}</p>
                  <p className="text-sm text-brand-100">
                    {typeInfo(selectedSlot).label} · {money(rate)}/hour
                  </p>
                </div>
              </>
            }
          >
            <form onSubmit={handleBook} className="space-y-4 p-5">
              {driverFields}

              {selectedIsEv ? (
                <div>
                  <p className="mb-1.5 text-sm font-medium">How long do you need to charge?</p>
                  <Choice options={chargeOptions} value={chargeMinutes} onChange={setChargeMinutes} label={chargeLabel} />
                </div>
              ) : (
                <div>
                  <p className="mb-1.5 text-sm font-medium">How long will you stay?</p>
                  <Choice options={DURATIONS} value={durationHours} onChange={setDurationHours} label={durationLabel} />
                </div>
              )}

              <div className="space-y-1.5 rounded-xl bg-stone-50 p-4 text-sm dark:bg-stone-800/60">
                <div className="flex justify-between text-stone-600 dark:text-stone-300">
                  <span>
                    {selectedIsEv
                      ? `${money(rate)}/h × ${formatMinutes(chargeMinutes)} charging`
                      : `${money(rate)} × ${plural(durationHours, "hour")}`}
                  </span>
                  <span>{money(bookingCost)}</span>
                </div>
                {unpaidFees > 0 && (
                  <div className="flex justify-between text-rose-600 dark:text-rose-400">
                    <span>Unpaid no-show fee</span>
                    <span>+{money(unpaidFees)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-600 dark:text-stone-300">
                  <span>Arrival window</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">15 minutes</span>
                </div>
                <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-bold dark:border-stone-700">
                  <span>Total</span>
                  <span className="text-emerald-600 dark:text-emerald-400">{money(bookingCost + unpaidFees)}</span>
                </div>
                {selectedIsEv && (
                  <p className="flex gap-1.5 pt-1 text-xs text-sky-700 dark:text-sky-300">
                    <Zap className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Charging starts when you check in. When it is done you have {evRules?.idle_grace_minutes ?? 10} minutes to move; after that an idle
                      fee of {money(evRules?.idle_fee_per_minute ?? 0.5)}/min applies (max {money(evRules?.idle_fee_cap ?? 30)}).
                    </span>
                  </p>
                )}
                <p className="pt-1 text-xs text-stone-500 dark:text-stone-400">
                  Free cancellation until you check in. If you do not arrive within 15 minutes, a no-show fee of{" "}
                  {money(rate * (rules?.fee_hours ?? 1))} is added to your next booking.
                </p>
              </div>

              {errorBox}

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
          </Dialog>
        )}
      </AnimatePresence>

      {/* ---------- waitlist dialog ---------- */}
      <AnimatePresence>
        {waitType && (
          <Dialog
            key="wait"
            onClose={() => setWaitType(null)}
            header={
              <>
                <span className="flex size-14 items-center justify-center rounded-lg bg-white/20">
                  <ListOrdered className="size-7" />
                </span>
                <div>
                  <p className="text-lg font-bold">Join the waitlist</p>
                  <p className="text-sm text-brand-100">We book the next free space for you</p>
                </div>
              </>
            }
          >
            <form onSubmit={handleJoinWaitlist} className="space-y-4 p-5">
              {lotTypes.length > 1 && (
                <div>
                  <p className="mb-1.5 text-sm font-medium">Type of space</p>
                  <Choice
                    options={lotTypes}
                    value={waitType}
                    onChange={setWaitType}
                    label={(t) => (t === "ev_charging" ? "EV" : t === "handicapped" ? "Accessible" : "Standard")}
                  />
                </div>
              )}
              {driverFields}
              {waitType === "ev_charging" ? (
                <div>
                  <p className="mb-1.5 text-sm font-medium">How long do you need to charge?</p>
                  <Choice options={chargeOptions} value={chargeMinutes} onChange={setChargeMinutes} label={chargeLabel} />
                </div>
              ) : (
                <div>
                  <p className="mb-1.5 text-sm font-medium">How long will you stay?</p>
                  <Choice options={DURATIONS} value={durationHours} onChange={setDurationHours} label={durationLabel} />
                </div>
              )}
              {waitType === "ev_charging" && ev?.next_free_at && (
                <p className="flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300">
                  <Zap className="size-3.5" /> The next charger should be free around {clock(ev.next_free_at)}.
                </p>
              )}
              <div>
                <p className="mb-1.5 text-sm font-medium">How long can you wait?</p>
                <Choice options={WAIT_OPTIONS} value={waitMinutes} onChange={setWaitMinutes} label={(m) => (m < 60 ? `${m} min` : `${m / 60} h`)} />
              </div>
              <p className="rounded-xl bg-stone-50 p-4 text-xs text-stone-600 dark:bg-stone-800/60 dark:text-stone-300">
                First come, first served. When {withArticle(TYPE_LABEL[waitType])} space frees up it is booked for you (
                {waitlist?.queue[waitType] ? `${plural(waitlist.queue[waitType], "driver")} ahead of you` : "you would be first"}). You get the PIN under the
                bell and 15 minutes to arrive; the normal no-show fee applies if you do not come.
              </p>
              {errorBox}
              <div className="flex gap-2">
                <button type="button" onClick={() => setWaitType(null)} className="btn-ghost flex-1 !py-2.5">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="btn-primary flex-1 !py-2.5">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <ListOrdered className="size-4" />}
                  {busy ? "Joining..." : "Join the waitlist"}
                </button>
              </div>
            </form>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}
