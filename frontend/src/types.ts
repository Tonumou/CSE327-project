// Shapes of the JSON data returned by the FastAPI backend

export type SlotType = "standard" | "ev_charging" | "handicapped";

export interface Slot {
  id: number;
  slot_code: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points: number[][] | null; // 4 corners of a tilted slot, null = rectangle
  status: "free" | "occupied" | "reserved"; // "reserved" = booked, car not there yet
  updated_at: string;
  slot_type?: SlotType; // Feature 3: set on the Slot Setup page
  hourly_rate?: number;
}

export interface Status {
  total_slots: number;
  free_slots: number;
  occupied_slots: number;
  reserved_slots: number;
  cars_detected: number;
  cars_outside_slots: number;
  last_update: string | null;
  source: string;
  ai_running: boolean;
  error: string;
  frame_width: number;
  frame_height: number;
}

export interface Log {
  id: number;
  total_slots: number;
  free_slots: number;
  occupied_slots: number;
  cars_detected: number;
  cars_outside_slots: number;
  created_at: string;
}

// ---------- user accounts ----------

export type Role = "driver" | "operator";

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: Role; // the first registered account is the operator (admin)
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ---------- Feature 3: reservations (Tamanna Akter Mou) ----------

export type ReservationStatus = "pending" | "active" | "completed" | "cancelled" | "expired";

export interface Reservation {
  id: number;
  reservation_code: string;
  slot_id: number;
  slot_code: string;
  driver_name: string;
  driver_email: string;
  license_plate: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  total_price: number;
  status: ReservationStatus;
  grace_deadline: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  slot_type: SlotType;
  hourly_rate: number;
  user_id: number | null;
  checkin_pin?: string; // only in /mine, only while the booking is open
  penalty_fee: number; // no-show fee charged for this booking
  penalty_paid_by: number | null; // later booking that collected that fee
  fees_included: number; // old no-show fees added to this booking's total
  charging_minutes: number | null; // Feature 4: EV chargers are booked by charging time
  idle_fee: number; // Feature 4: fee for staying at the charger after charging
}

export interface NewReservation {
  slot_id: number;
  driver_name: string;
  driver_email: string;
  license_plate: string;
  duration_hours: number;
  charging_minutes?: number; // EV chargers only
}

// returned once, to the driver who booked (contains the check-in PIN)
export interface BookingTicket {
  id: number;
  reservation_code: string;
  slot_id: number;
  slot_code: string;
  checkin_pin: string;
  total_price: number;
  fees_included: number;
  grace_deadline: string;
  message: string;
}

// ---------- Feature 3: no-show penalties, waitlist, notifications ----------

export interface PenaltyStatus {
  no_shows: number; // in the last rules.window_days days
  unpaid_fees: number; // added to the next booking
  blocked_until: string | null; // booking paused until then
  rules: { fee_hours: number; limit: number; window_days: number; block_hours: number };
}

export interface WaitlistEntry {
  id: number;
  slot_type: SlotType;
  license_plate: string;
  duration_hours: number;
  status: "waiting" | "assigned" | "left" | "timed_out";
  created_at: string;
  expires_at: string;
}

export interface WaitlistStatus {
  entry: WaitlistEntry | null; // null = not waiting
  position: number | null; // 1 = next in line
  queue: Record<SlotType, number>; // drivers waiting per type
}

export interface NewWaitlistEntry {
  slot_type: SlotType;
  driver_name: string;
  driver_email: string;
  license_plate: string;
  duration_hours: number;
  charging_minutes?: number; // EV queue only
  wait_minutes: number;
}

// ---------- Feature 4: EV charging coordination ----------

export type EvState = "free" | "occupied" | "reserved" | "charging" | "charged" | "idle";

export interface EvCharger {
  slot_id: number;
  slot_code: string;
  state: EvState; // charged = done, driver should move; idle = overstaying, fee running
  started_at: string | null;
  ends_at: string | null; // end of the charging time
  free_at: string | null; // expected free (null = unknown / overdue)
  idle_minutes: number;
  idle_fee: number;
  license_plate?: string; // operator only
  driver_name?: string; // operator only
}

export interface EvRules {
  rate_per_hour: number;
  charge_options: number[]; // minutes
  soon_minutes: number;
  idle_grace_minutes: number;
  idle_fee_per_minute: number;
  idle_fee_cap: number;
}

export interface EvStatus {
  chargers: EvCharger[];
  next_free_at: string | null;
  queue: number; // drivers on the EV waitlist
  rules: EvRules;
}

export interface AppNotification {
  id: number;
  kind: string; // booking_expired, waitlist_assigned, waitlist_timeout, session_completed, ...
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}
