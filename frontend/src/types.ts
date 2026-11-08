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
  slot_type: SlotType;
  hourly_rate: number;
}

export interface NewReservation {
  slot_id: number;
  driver_name: string;
  driver_email: string;
  license_plate: string;
  duration_hours: number;
}

// returned once, to the driver who booked (contains the check-in PIN)
export interface BookingTicket {
  id: number;
  reservation_code: string;
  slot_code: string;
  checkin_pin: string;
  total_price: number;
  grace_deadline: string;
  message: string;
}
