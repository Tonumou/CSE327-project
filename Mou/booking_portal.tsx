import { useState, useEffect } from "react";
import type { Slot } from "../frontend/src/types";

interface ExtendedSlot extends Slot {
  slot_type?: "standard" | "ev_charging" | "handicapped";
  hourly_rate?: number;
}

interface ActiveReservation {
  id: number;
  reservation_code: string;
  slot_code: string;
  driver_name: string;
  license_plate: string;
  total_price: number;
  grace_deadline: string;
  checkin_pin: string;
  status: "pending" | "active";
}

export default function BookingPortal() {
  const [slots, setSlots] = useState<ExtendedSlot[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedSlot, setSelectedSlot] = useState<ExtendedSlot | null>(null);
  const [driverName, setDriverName] = useState("");
  const [driverEmail, setDriverEmail] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [durationHours, setDurationHours] = useState(1);
  const [activeReservation, setActiveReservation] = useState<ActiveReservation | null>(null);
  const [graceSecondsLeft, setGraceSecondsLeft] = useState(900); // 15 mins default
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [enteredPin, setEnteredPin] = useState("");
  const [checkinSuccess, setCheckinSuccess] = useState(false);

  // Poll available slots from backend
  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/slots");
        if (res.ok) {
          const data: ExtendedSlot[] = await res.json();
          // Assign simulated types if not set in DB yet
          const mapped = data.map((s, idx) => ({
            ...s,
            slot_type: s.slot_type || (idx % 3 === 1 ? "ev_charging" : "standard"),
            hourly_rate: s.hourly_rate || (idx % 3 === 1 ? 5.0 : 2.5),
          }));
          setSlots(mapped);
        }
      } catch (err) {
        // Fallback demo data if backend is offline
        setSlots([
          { id: 1, slot_code: "P1", x1: 0, y1: 0, x2: 100, y2: 100, points: null, status: "free", updated_at: "Now", slot_type: "standard", hourly_rate: 2.5 },
          { id: 2, slot_code: "P2", x1: 0, y1: 0, x2: 100, y2: 100, points: null, status: "occupied", updated_at: "Now", slot_type: "ev_charging", hourly_rate: 5.0 },
          { id: 3, slot_code: "P3", x1: 0, y1: 0, x2: 100, y2: 100, points: null, status: "free", updated_at: "Now", slot_type: "ev_charging", hourly_rate: 5.0 },
          { id: 4, slot_code: "P4", x1: 0, y1: 0, x2: 100, y2: 100, points: null, status: "free", updated_at: "Now", slot_type: "standard", hourly_rate: 2.5 },
        ]);
      }
    };
    fetchSlots();
    const interval = setInterval(fetchSlots, 2500);
    return () => clearInterval(interval);
  }, []);

  // Grace Period countdown timer
  useEffect(() => {
    if (!activeReservation || activeReservation.status === "active") return;
    const timer = setInterval(() => {
      setGraceSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setActiveReservation(null);
          alert("Grace period expired! Your reservation has been auto-released.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeReservation]);

  const handleBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !driverName || !licensePlate) return;

    const rate = selectedSlot.hourly_rate || 2.5;
    const total = rate * durationHours;
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const code = "RES-" + Math.random().toString(36).substring(2, 6).toUpperCase();

    const newRes: ActiveReservation = {
      id: Date.now(),
      reservation_code: code,
      slot_code: selectedSlot.slot_code,
      driver_name: driverName,
      license_plate: licensePlate.toUpperCase(),
      total_price: total,
      grace_deadline: new Date(Date.now() + 15 * 60000).toLocaleTimeString(),
      checkin_pin: pin,
      status: "pending",
    };

    setActiveReservation(newRes);
    setGraceSecondsLeft(900);
    setBookingSuccess(true);
    setSelectedSlot(null);
  };

  const handleCheckin = () => {
    if (activeReservation && enteredPin === activeReservation.checkin_pin) {
      setActiveReservation({ ...activeReservation, status: "active" });
      setCheckinSuccess(true);
    } else {
      alert("Invalid 4-digit PIN! Please enter the PIN shown on your booking ticket.");
    }
  };

  const handleCancel = () => {
    if (confirm("Are you sure you want to cancel this reservation? The slot will be released immediately.")) {
      setActiveReservation(null);
      setBookingSuccess(false);
      setCheckinSuccess(false);
    }
  };

  const filteredSlots = slots.filter((s) => {
    if (filterType === "standard") return s.slot_type === "standard";
    if (filterType === "ev") return s.slot_type === "ev_charging";
    return true;
  });

  const freeCount = filteredSlots.filter((s) => s.status === "free").length;
  const minutes = Math.floor(graceSecondsLeft / 60);
  const seconds = graceSecondsLeft % 60;

  return (
    <div className="space-y-6">
      {/* Banner Header */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white rounded-2xl p-6 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-500 text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
              Feature 3 • Customer Portal
            </span>
            <span className="text-blue-200 text-xs">Authored by Tamanna Akter Mou</span>
          </div>
          <h2 className="text-2xl font-bold">Reserve a Parking Space</h2>
          <p className="text-sm text-blue-100 mt-1">
            Real-time live slot booking with 15-minute dynamic arrival grace period.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-2 text-center border border-white/20">
            <div className="text-2xl font-bold text-emerald-400">{freeCount}</div>
            <div className="text-xs text-blue-200">Available Now</div>
          </div>
        </div>
      </div>

      {/* Active Reservation Ticket Card (If Reserved) */}
      {activeReservation && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-amber-600 text-xl font-bold">🎫 Active Reservation</span>
              <span className="bg-amber-200 text-amber-800 text-xs font-mono font-bold px-2 py-0.5 rounded">
                {activeReservation.reservation_code}
              </span>
            </div>
            {activeReservation.status === "pending" ? (
              <div className="flex items-center gap-2 bg-amber-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                <span>⏱ Grace Period Countdown:</span>
                <span className="font-mono text-sm">{`${minutes}:${seconds < 10 ? "0" : ""}${seconds}`}</span>
              </div>
            ) : (
              <div className="bg-emerald-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                ✔ Checked-in & Parked
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-white p-3 rounded-lg border border-amber-200">
              <div className="text-xs text-slate-500">Slot Assigned</div>
              <div className="text-lg font-bold text-blue-700">{activeReservation.slot_code}</div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-amber-200">
              <div className="text-xs text-slate-500">License Plate</div>
              <div className="text-base font-bold text-slate-800">{activeReservation.license_plate}</div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-amber-200">
              <div className="text-xs text-slate-500">Estimated Total</div>
              <div className="text-base font-bold text-emerald-600">${activeReservation.total_price.toFixed(2)}</div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-amber-200">
              <div className="text-xs text-slate-500">Check-in PIN</div>
              <div className="text-lg font-mono font-bold text-indigo-700">{activeReservation.checkin_pin}</div>
            </div>
          </div>

          {activeReservation.status === "pending" && !checkinSuccess && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <input
                type="text"
                placeholder="Enter 4-Digit Arrival PIN"
                maxLength={4}
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-44 font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleCheckin}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition"
              >
                Verify & Check-In
              </button>
              <button
                onClick={handleCancel}
                className="bg-slate-200 hover:bg-red-100 hover:text-red-700 text-slate-700 text-sm font-semibold px-3 py-1.5 rounded-lg transition ml-auto"
              >
                Cancel Booking
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${
              filterType === "all" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            All Spaces ({slots.length})
          </button>
          <button
            onClick={() => setFilterType("standard")}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${
              filterType === "standard" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            Standard Only
          </button>
          <button
            onClick={() => setFilterType("ev")}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1 ${
              filterType === "ev" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>⚡ EV Charging</span>
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span> Free
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span> Reserved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500"></span> Occupied
          </span>
        </div>
      </div>

      {/* Interactive Slot Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredSlots.map((slot) => {
          const isFree = slot.status === "free";
          const isEv = slot.slot_type === "ev_charging";
          return (
            <div
              key={slot.id}
              className={`rounded-2xl p-4 border transition-all duration-200 ${
                isFree
                  ? "bg-white border-slate-200 hover:border-blue-400 hover:shadow-md"
                  : "bg-slate-50 border-slate-200 opacity-80"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xl font-bold text-slate-800">{slot.slot_code}</span>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {isEv ? "⚡ EV Fast Charger" : "Standard Bay"}
                  </div>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    slot.status === "free"
                      ? "bg-emerald-100 text-emerald-800"
                      : slot.status === "reserved"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {slot.status}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <div>
                  <span className="text-xs text-slate-400">Rate:</span>
                  <span className="text-sm font-bold text-slate-700 ml-1">
                    ${(slot.hourly_rate || 2.5).toFixed(2)}/hr
                  </span>
                </div>
                {isFree ? (
                  <button
                    onClick={() => setSelectedSlot(slot)}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition"
                  >
                    Reserve Now
                  </button>
                ) : (
                  <span className="text-xs text-slate-400 font-medium">Unavailable</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reservation Modal */}
      {selectedSlot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                Book Slot {selectedSlot.slot_code}
              </h3>
              <button
                onClick={() => setSelectedSlot(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Driver Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tamanna Akter"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={driverEmail}
                  onChange={(e) => setDriverEmail(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Vehicle License Plate
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DHA-12-3456"
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Duration (Hours)
                </label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                >
                  <option value={1}>1 Hour</option>
                  <option value={2}>2 Hours</option>
                  <option value={3}>3 Hours</option>
                  <option value={4}>4 Hours</option>
                  <option value={8}>Full Day (8 Hours)</option>
                </select>
              </div>

              {/* Price Calculation Summary */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Hourly Tariff:</span>
                  <span className="font-semibold">${(selectedSlot.hourly_rate || 2.5).toFixed(2)}/hr</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Grace Period:</span>
                  <span className="font-semibold text-amber-600">15 minutes arrival window</span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold text-sm pt-1 border-t border-slate-200">
                  <span>Total Due:</span>
                  <span className="text-emerald-600">${((selectedSlot.hourly_rate || 2.5) * durationHours).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSlot(null)}
                  className="w-1/2 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition"
                >
                  Confirm & Book
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
