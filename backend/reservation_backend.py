# ------------------------------------------------------------
# reservation_backend.py
# Feature 3: Driver Slot Reservation Engine & Grace Period Worker
# Author: Tamanna Akter Mou (ID: 2211951042)
#
# Life of a booking:
#   pending --check in with the PIN--> active --check out / car has left--> completed
#   pending --driver cancels--> cancelled
#   pending --15-minute grace period runs out--> expired (a "no-show")
#
# Every booking belongs to the logged-in account that made it, and a
# driver has at most one open (pending or active) booking at a time.
# ------------------------------------------------------------
import datetime
import decimal
import random
import string
import threading
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import database
import penalties
from auth import require_operator, require_user
from notifications import notify

router = APIRouter(prefix="/api/reservations", tags=["Reservations"])

GRACE_PERIOD_MINUTES = 15

# Hourly tariff per slot type (used when an operator changes a slot's type)
SLOT_TYPE_RATES = {"standard": 2.50, "ev_charging": 5.00, "handicapped": 2.50}

# a booking in one of these states still holds its parking space
OPEN_STATUSES = ("pending", "active")

# a space can be booked when the camera sees it empty AND no open booking holds it
FREE_SLOT_SQL = """s.status = 'free' AND NOT EXISTS (
    SELECT 1 FROM reservations r WHERE r.slot_id = s.id AND r.status IN ('pending', 'active'))"""

# a reservation row together with the space it is for
RESERVATION_SELECT = """
    SELECT r.*, s.slot_code, s.slot_type, s.hourly_rate
    FROM reservations r
    JOIN slots s ON r.slot_id = s.id"""

# Bookings are made one at a time (driver requests and the background worker run
# in different threads), so two drivers can never be given the same space.
BOOKING_LOCK = threading.Lock()

# ---------- Pydantic Request Models ----------

class ReservationCreate(BaseModel):
    slot_id: int
    driver_name: str = Field(min_length=1, max_length=100)
    driver_email: str = Field(min_length=3, max_length=120)
    license_plate: str = Field(min_length=1, max_length=30)
    duration_hours: int = Field(default=1, ge=1, le=24)
    slot_type: Optional[str] = "standard"


class CheckinRequest(BaseModel):
    checkin_pin: str


class SlotTypeUpdate(BaseModel):
    slot_type: str


def _iso(value):
    """DATETIME -> '2026-11-08T18:30:00' (browser-friendly), None stays None."""
    return value.isoformat(timespec="seconds") if value else None


def _public(res: dict, show_pin: bool = False) -> dict:
    """JSON-friendly reservation row. The check-in PIN is only sent to the driver
    who owns the booking (show_pin=True), never in lists for the operator."""
    out = {k: v for k, v in res.items() if show_pin or k != "checkin_pin"}
    for key, value in out.items():
        if isinstance(value, datetime.datetime):
            out[key] = _iso(value)
        elif isinstance(value, decimal.Decimal):  # money columns
            out[key] = float(value)
    return out


# ---------- Database Helpers ----------

def generate_reservation_code() -> str:
    letters = "".join(random.choices(string.ascii_uppercase, k=3))
    digits = "".join(random.choices(string.digits, k=4))
    return f"RES-{letters}{digits}"


def generate_pin() -> str:
    return "".join(random.choices(string.digits, k=4))


def ensure_reservation_tables():
    """Ensure the reservations table and slot columns exist in MySQL."""
    conn = database.get_connection()
    with conn.cursor() as cur:
        # Check if slot_type exists in slots
        cur.execute("SHOW COLUMNS FROM slots LIKE 'slot_type'")
        if not cur.fetchone():
            try:
                cur.execute("""
                    ALTER TABLE slots
                    ADD COLUMN slot_type ENUM('standard', 'ev_charging', 'handicapped') NOT NULL DEFAULT 'standard' AFTER points,
                    ADD COLUMN hourly_rate DECIMAL(5,2) NOT NULL DEFAULT 2.50 AFTER slot_type
                """)
            except Exception:
                pass

        # Check and expand status ENUM if needed
        try:
            cur.execute("ALTER TABLE slots MODIFY COLUMN status ENUM('free','occupied','reserved') NOT NULL DEFAULT 'free'")
        except Exception:
            pass

        # Create reservations table if not exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS reservations (
              id INT AUTO_INCREMENT PRIMARY KEY,
              reservation_code VARCHAR(16) NOT NULL UNIQUE,
              slot_id INT NOT NULL,
              user_id INT NULL,
              driver_name VARCHAR(100) NOT NULL,
              driver_email VARCHAR(120) NOT NULL,
              license_plate VARCHAR(30) NOT NULL,
              start_time DATETIME NOT NULL,
              end_time DATETIME NOT NULL,
              duration_hours INT NOT NULL DEFAULT 1,
              total_price DECIMAL(6,2) NOT NULL DEFAULT 0.00,
              status ENUM('pending', 'active', 'completed', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
              grace_deadline DATETIME NOT NULL,
              checkin_pin VARCHAR(6) NOT NULL,
              checked_in_at DATETIME NULL,
              checked_out_at DATETIME NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_reservations_user (user_id),
              CONSTRAINT fk_res_slot FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE,
              CONSTRAINT fk_res_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
        """)
        # tables made by an older version: bookings did not belong to an account yet
        database.add_column(cur, "reservations", "user_id", "INT NULL AFTER slot_id")
        database.add_column(cur, "reservations", "checked_out_at", "DATETIME NULL AFTER checked_in_at")
    conn.close()


def open_booking_of(cur, user_id):
    """The driver's pending or checked-in booking, or None."""
    cur.execute("""
        SELECT id, reservation_code FROM reservations
        WHERE user_id = %s AND status IN ('pending', 'active') LIMIT 1""", (user_id,))
    return cur.fetchone()


def find_free_slot(cur, slot_type=None):
    """First bookable space (of one type, or of any type when slot_type is None)."""
    sql = f"SELECT s.* FROM slots s WHERE {FREE_SLOT_SQL}"
    params = ()
    if slot_type:
        sql += " AND s.slot_type = %s"
        params = (slot_type,)
    cur.execute(sql + " ORDER BY s.slot_code LIMIT 1", params)
    return cur.fetchone()


def claim_slot(cur, slot_id) -> bool:
    """Turn a free space into 'reserved' in one UPDATE. False when it is not
    bookable any more (taken by another driver or a car meanwhile)."""
    return cur.execute(f"UPDATE slots s SET s.status = 'reserved' WHERE s.id = %s AND {FREE_SLOT_SQL}",
                       (slot_id,)) == 1


def release_slot(cur, slot_id):
    """Give a held space back. If a car is parked there the camera keeps it 'occupied'."""
    cur.execute("UPDATE slots SET status = 'free' WHERE id = %s AND status = 'reserved'", (slot_id,))


def insert_reservation(cur, user_id, slot, driver_name, driver_email, license_plate, duration_hours):
    """Create a 'pending' booking on a space that claim_slot() already holds.
    Returns the ticket (with the check-in PIN) for the driver."""
    now = datetime.datetime.now()
    end_time = now + datetime.timedelta(hours=duration_hours)
    grace_deadline = now + datetime.timedelta(minutes=GRACE_PERIOD_MINUTES)
    hourly_rate = float(slot.get("hourly_rate") or 2.50)
    total_price = round(hourly_rate * duration_hours, 2)
    res_code = generate_reservation_code()
    pin = generate_pin()

    cur.execute("""
        INSERT INTO reservations
        (reservation_code, slot_id, user_id, driver_name, driver_email, license_plate,
         start_time, end_time, duration_hours, total_price, status, grace_deadline, checkin_pin)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s)
    """, (
        res_code, slot["id"], user_id, driver_name.strip(), driver_email.strip(),
        license_plate.strip().upper(), now, end_time, duration_hours,
        total_price, grace_deadline, pin
    ))
    res_id = cur.lastrowid

    # unpaid no-show fees from earlier bookings are collected on this ticket
    fees = penalties.collect_unpaid_fees(cur, user_id, res_id) if user_id is not None else 0.0
    if fees:
        total_price = round(total_price + fees, 2)
        cur.execute("UPDATE reservations SET total_price = %s, fees_included = %s WHERE id = %s",
                    (total_price, fees, res_id))
    return {
        "id": res_id,
        "reservation_code": res_code,
        "slot_id": slot["id"],
        "slot_code": slot["slot_code"],
        "checkin_pin": pin,
        "total_price": total_price,
        "fees_included": fees,
        "grace_deadline": _iso(grace_deadline),
    }


def drivers_waiting_for(cur, slot_type, except_user_id):
    """Other drivers in the waitlist queue for this type of space (see waitlist.py)."""
    cur.execute("SELECT COUNT(*) AS n FROM waitlist WHERE status = 'waiting' AND slot_type = %s AND user_id <> %s",
                (slot_type, except_user_id))
    return cur.fetchone()["n"]


def _load_owned(cur, res_id, user):
    """A reservation the logged-in user may act on: their own (the operator may act on any)."""
    cur.execute(RESERVATION_SELECT + " WHERE r.id = %s", (res_id,))
    res = cur.fetchone()
    if not res:
        raise HTTPException(404, "Reservation not found")
    if res["user_id"] != user["id"] and user["role"] != "operator":
        raise HTTPException(403, "This is not your reservation")
    return res


# ---------- REST API Endpoints ----------

@router.get("/active", dependencies=[Depends(require_operator)])
def get_active_reservations():
    """Operator: all bookings that currently hold a space (they contain names and plates)."""
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute(RESERVATION_SELECT + " WHERE r.status IN ('pending', 'active') ORDER BY r.created_at DESC")
        rows = cur.fetchall()
    conn.close()
    return [_public(r) for r in rows]


@router.get("/mine")
def my_reservations(limit: int = 10, user=Depends(require_user)):
    """The logged-in driver's latest bookings, newest first. Open bookings
    include their check-in PIN, so the ticket can be shown on any device."""
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute(RESERVATION_SELECT + " WHERE r.user_id = %s ORDER BY r.id DESC LIMIT %s",
                    (user["id"], max(1, min(limit, 50))))
        rows = cur.fetchall()
    conn.close()
    return [_public(r, show_pin=r["status"] in OPEN_STATUSES) for r in rows]


@router.get("/{res_id}")
def get_reservation(res_id: int, user=Depends(require_user)):
    """One reservation (the booking page uses it to follow its ticket's status)."""
    conn = database.get_connection()
    try:
        with conn.cursor() as cur:
            res = _load_owned(cur, res_id, user)
    finally:
        conn.close()
    return _public(res)


@router.put("/slots/{slot_id}/type", dependencies=[Depends(require_operator)])
def set_slot_type(slot_id: int, body: SlotTypeUpdate):
    """Operator marks a slot as standard / EV charging / handicapped (sets its tariff too)."""
    if body.slot_type not in SLOT_TYPE_RATES:
        raise HTTPException(400, f"slot_type must be one of {', '.join(SLOT_TYPE_RATES)}")
    conn = database.get_connection()
    with conn.cursor() as cur:
        changed = cur.execute(
            "UPDATE slots SET slot_type = %s, hourly_rate = %s WHERE id = %s",
            (body.slot_type, SLOT_TYPE_RATES[body.slot_type], slot_id),
        )
    conn.close()
    if not changed:
        raise HTTPException(404, "Slot not found")
    return {"id": slot_id, "slot_type": body.slot_type, "hourly_rate": SLOT_TYPE_RATES[body.slot_type]}


@router.post("")
def create_reservation(data: ReservationCreate, user=Depends(require_user)):
    """Book a vacant parking slot for the logged-in driver."""
    conn = database.get_connection()
    try:
        with BOOKING_LOCK, conn.cursor() as cur:
            penalties.check_can_book(cur, user["id"])  # paused after repeated no-shows
            if open_booking_of(cur, user["id"]):
                raise HTTPException(400, "You already have a booking. Cancel or finish it before booking another space.")

            cur.execute("SELECT * FROM slots WHERE id = %s", (data.slot_id,))
            slot = cur.fetchone()
            if not slot:
                raise HTTPException(404, "Selected parking slot does not exist")

            # drivers on the waitlist get the next free space of their type first
            waiting = drivers_waiting_for(cur, slot["slot_type"], user["id"])
            if waiting:
                grace_worker.wake()  # hand the space to the queue now
                raise HTTPException(409, f"{waiting} driver(s) on the waitlist are first in line for this kind "
                                         "of space. Join the waitlist to get the next one.")

            # Update slot status to reserved (only if nobody else holds it)
            if not claim_slot(cur, slot["id"]):
                raise HTTPException(400, f"Slot {slot['slot_code']} is not free any more")
            try:
                ticket = insert_reservation(cur, user["id"], slot, data.driver_name,
                                            data.driver_email, data.license_plate, data.duration_hours)
            except Exception:
                release_slot(cur, slot["id"])
                raise
            # booking directly takes the driver off the waitlist
            cur.execute("UPDATE waitlist SET status = 'left' WHERE user_id = %s AND status = 'waiting'", (user["id"],))
    finally:
        conn.close()

    return {**ticket, "message": f"Slot {slot['slot_code']} reserved! Check in within {GRACE_PERIOD_MINUTES} minutes."}


@router.post("/{res_id}/checkin")
def checkin_reservation(res_id: int, req: CheckinRequest, user=Depends(require_user)):
    """Driver checks in upon arriving at the parking lot."""
    conn = database.get_connection()
    try:
        with conn.cursor() as cur:
            res = _load_owned(cur, res_id, user)
            if res["status"] != "pending":
                raise HTTPException(400, f"Reservation is already {res['status']}")

            now = datetime.datetime.now()
            if now > res["grace_deadline"]:
                grace_worker.wake()  # expire it right away
                raise HTTPException(400, f"The {GRACE_PERIOD_MINUTES}-minute grace period is over, so this booking has expired")

            if str(res["checkin_pin"]).strip() != req.checkin_pin.strip():
                raise HTTPException(400, "Invalid 4-digit PIN")

            # the booked time starts when the driver arrives
            end_time = now + datetime.timedelta(hours=res["duration_hours"])
            cur.execute("""
                UPDATE reservations
                SET status = 'active', checked_in_at = %s, end_time = %s
                WHERE id = %s
            """, (now, end_time, res_id))

            # Mark slot occupied
            cur.execute("UPDATE slots SET status = 'occupied' WHERE id = %s", (res["slot_id"],))
    finally:
        conn.close()
    return {"message": "Check-in successful! Welcome to your parking spot.", "status": "active",
            "end_time": _iso(end_time)}


@router.post("/{res_id}/cancel")
def cancel_reservation(res_id: int, user=Depends(require_user)):
    """Driver cancels a booking before arriving (always free of charge)."""
    conn = database.get_connection()
    try:
        with conn.cursor() as cur:
            res = _load_owned(cur, res_id, user)
            if res["status"] != "pending":
                hint = " Use check-out to end your parking session." if res["status"] == "active" else ""
                raise HTTPException(400, f"Reservation is already {res['status']}.{hint}")

            cur.execute("UPDATE reservations SET status = 'cancelled' WHERE id = %s", (res_id,))
            # Free up the slot only if it is still held for this booking; if a car is
            # physically parked there the camera keeps it 'occupied'.
            release_slot(cur, res["slot_id"])
            penalties.return_unpaid_fees(cur, res_id)  # old fees move to the next booking
    finally:
        conn.close()
    grace_worker.wake()  # the space may go to the next driver straight away
    return {"message": "Reservation cancelled. Slot is now free.", "status": "cancelled"}


@router.post("/{res_id}/checkout")
def checkout_reservation(res_id: int, user=Depends(require_user)):
    """Driver leaves: the parking session ends and the space is released."""
    conn = database.get_connection()
    try:
        with conn.cursor() as cur:
            res = _load_owned(cur, res_id, user)
            if res["status"] != "active":
                raise HTTPException(400, f"Only a checked-in booking can be checked out (this one is {res['status']})")
            cur.execute("UPDATE reservations SET status = 'completed', checked_out_at = %s WHERE id = %s",
                        (datetime.datetime.now(), res_id))
            # if the camera still sees the car it marks the space 'occupied' again
            cur.execute("UPDATE slots SET status = 'free' WHERE id = %s AND status IN ('occupied', 'reserved')",
                        (res["slot_id"],))
    finally:
        conn.close()
    grace_worker.wake()
    return {"message": "Checked out. Thank you for parking with us!", "status": "completed",
            "total_price": float(res["total_price"])}


# ---------- Background jobs (run by the worker below) ----------

def expire_no_shows(cur):
    """Find pending reservations past their 15-minute grace deadline and auto-release them."""
    now = datetime.datetime.now()
    cur.execute(RESERVATION_SELECT + " WHERE r.status = 'pending' AND r.grace_deadline < %s", (now,))
    for res in cur.fetchall():
        print(f"[GraceWorker] Reservation {res['reservation_code']} expired! Auto-releasing slot.")
        cur.execute("UPDATE reservations SET status = 'expired' WHERE id = %s AND status = 'pending'", (res["id"],))
        release_slot(cur, res["slot_id"])
        penalties.return_unpaid_fees(cur, res["id"])
        penalty_text = penalties.apply_no_show(cur, res)  # no-show fee (see penalties.py)
        notify(cur, res["user_id"], "booking_expired", f"Booking {res['reservation_code']} expired",
               f"You did not check in at space {res['slot_code']} within {GRACE_PERIOD_MINUTES} minutes, "
               "so the space was given back." + penalty_text)


def complete_finished_sessions(cur):
    """Checked-in bookings whose booked time is over and whose space the camera
    sees empty again: the car has left, so the session ends by itself."""
    now = datetime.datetime.now()
    cur.execute(RESERVATION_SELECT + " WHERE r.status = 'active' AND r.end_time < %s AND s.status = 'free'", (now,))
    for res in cur.fetchall():
        print(f"[GraceWorker] Reservation {res['reservation_code']} finished: the car has left {res['slot_code']}.")
        cur.execute("UPDATE reservations SET status = 'completed', checked_out_at = %s WHERE id = %s",
                    (now, res["id"]))
        notify(cur, res["user_id"], "session_completed", f"Parking at {res['slot_code']} ended",
               f"Your booked time is over and the camera saw your car leave {res['slot_code']}. "
               "The session was checked out for you. Thank you!")


# ---------- Background Dynamic Grace Period Auto-Release Worker ----------

class GracePeriodWorker:
    """Runs the booking jobs every 30 seconds, or at once when wake() is called
    (e.g. right after a cancellation, so the freed space is handed on quickly).
    Other modules add their own jobs with add_job()."""

    def __init__(self, check_interval_seconds=30):
        self.interval = check_interval_seconds
        self.running = False
        self.jobs = [expire_no_shows, complete_finished_sessions]
        self._wake = threading.Event()

    def add_job(self, job):
        """job(cur) is called with a database cursor on every round."""
        self.jobs.append(job)

    def wake(self):
        self._wake.set()

    def run_once(self):
        for job in self.jobs:
            try:
                conn = database.get_connection()
                try:
                    with conn.cursor() as cur:
                        job(cur)
                finally:
                    conn.close()
            except Exception as e:  # one failing job must not stop the others
                print(f"[GraceWorker] {job.__name__} error:", e)

    def run(self):
        self.running = True
        print("[GraceWorker] Started 15-minute grace-period auto-release worker.")
        while self.running:
            self.run_once()
            self._wake.wait(self.interval)
            self._wake.clear()

    def start(self):
        t = threading.Thread(target=self.run, daemon=True)
        t.start()

    def stop(self):
        self.running = False
        self._wake.set()


grace_worker = GracePeriodWorker()
